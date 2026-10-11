// Sessions on DynamoDB: one item per token hash carrying copies of the listener, so a request is authenticated by ONE GetItem.
/**
 * M26 lane AC (AC-T02; patterns AC-41…AC-55, AC-59…AC-64, AC-132…AC-135). Items:
 * - `SESS#<tokenHash>/S` — the session: listenerId, publicId (the old `sessions.id`), deviceLabel, country,
 *   createdAt, lastSeenAt, rotatedAt, replacedAt/replacedBy (rotation), predecessor (the token it replaced:
 *   the old `replaced_by … ON DELETE CASCADE` walked backwards), actingAdminId, the second-factor fields,
 *   `activeDay` (the last Kuala Lumpur day recorded as app use), and COPIES of the listener's email,
 *   displayName, createdAt and suspendedAt (common.ts refreshSessionCopies keeps them current).
 *   TTL = createdAt + 180 days (M25's absolute cap; reads check the real times — TTL is a backstop).
 * - `L#<listener>/SESS#<publicId>` — pointer (device list, sign out others, deletion), written in the same
 *   transaction; strongly consistent, so no GSI is needed for these lists (replaces data-model's G5 use).
 * - `L#<admin>/ACTAS#<publicId>` — act-as pointer under the admin (replaces the `acting_admin_id` lookup).
 *
 * Guard G-M26-AC3: a known, recently seen session costs exactly one GetItem (the 5-minute `lastSeenAt` rule
 * and the once-a-day `activeDay` keep the steady state write-free).
 */
import { randomUUID } from 'node:crypto';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { del, get, put, update, type Item, type Key } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import type { Listener } from '../../../../auth/session.ts';
import { ROTATE_GRACE_SECONDS, SESSION_MAX_DAYS } from '../../../../auth/session.ts';
import type { StudioSessionRow } from '../sessions.ts';
import type { SecondFactorAtRow } from '../second-factor.ts';
import { DAY_MS, getListener, hashKey, iso, klDay, nowMs, partitionItems, unlessCondition, upd, aput, adel, txa, type Hybrid, bridgeOn } from './common.ts';
import { isAdminPg, recordDailyActive } from './foreign.ts';

const STUDIO = 'studio-web';
type Sess = Item & {
  listenerId: string; publicId: string; deviceLabel: string | null; country: string | null; createdAt: string; lastSeenAt: string; rotatedAt: string;
  replacedAt?: string; replacedBy?: string; predecessor?: string; actingAdminId?: string; activeDay?: string;
  email: string; displayName: string; listenerCreatedAt: string; suspendedAt: string | null;
  secondFactorAt?: string; secondFactorCode?: Uint8Array; secondFactorSentAt?: string; secondFactorTries?: number;
};

export const getSession = async (h: Hybrid, key: string): Promise<Sess | undefined> => (await get(h.store, 'main', K.session(key))) as Sess | undefined;

const asListener = (s: Sess): Listener => ({ id: s.listenerId, email: s.email, display_name: s.displayName, created_at: s.listenerCreatedAt, suspended_at: s.suspendedAt ?? null });

/** The live-session rule of auth/session.ts LIVE_SESSION: under 180 days old, and not replaced more than the grace ago. */
function live(s: Sess, now: number): boolean {
  if (Date.parse(s.createdAt) <= now - SESSION_MAX_DAYS * DAY_MS) return false;
  return !s.replacedAt || Date.parse(s.replacedAt) > now - ROTATE_GRACE_SECONDS * 1000;
}

async function newSessionItems(h: Hybrid, key: string, listenerId: string, f: {
  deviceLabel: string | null; country: string | null; createdAt: string; now: string; secondFactorAt?: string | null; actingAdminId?: string; predecessor?: string;
}): Promise<{ session: Item; pointer: Item; publicId: string }> {
  const l = await getListener(h, listenerId);
  if (!l) throw new Error('session: no such listener'); // the Postgres foreign key's answer
  const publicId = randomUUID();
  const session = encode('session', K.session(key), {
    tokenHash: key, listenerId, publicId, deviceLabel: f.deviceLabel, country: f.country, createdAt: f.createdAt, lastSeenAt: f.now, rotatedAt: f.now,
    secondFactorAt: f.secondFactorAt ?? undefined, secondFactorTries: 0, actingAdminId: f.actingAdminId, predecessor: f.predecessor,
    email: l.email, displayName: l.displayName, listenerCreatedAt: l.createdAt, suspendedAt: l.suspendedAt ?? null,
  }, { ttl: ttlAfter(Date.parse(f.createdAt), SESSION_MAX_DAYS * DAY_MS) });
  const pointer = encode('sessionPtr', K.listenerSessionPtr(listenerId, publicId), {
    tokenHash: key, publicId, deviceLabel: f.deviceLabel, actingAdminId: f.actingAdminId, createdAt: f.createdAt,
  });
  return { session, pointer, publicId };
}

export async function insertSession(h: Hybrid, hash: Buffer, listenerId: string, deviceLabel: string | null, country: string | null, extra: { secondFactor?: boolean }): Promise<void> {
  const now = iso(nowMs(h));
  const { session, pointer } = await newSessionItems(h, hashKey(hash), listenerId, { deviceLabel, country, createdAt: now, now, secondFactorAt: extra.secondFactor ? now : null });
  await txa(h.store).put('main', session, { condition: 'attribute_not_exists(PK)' }).put('main', pointer).commit();
}

/**
 * Deletes a session, its pointers, and every session it replaced (the old ON DELETE CASCADE through
 * `replaced_by`), walking `predecessor` links. Returns how many session items went. `skip` is kept.
 */
export async function deleteSessionChain(h: Hybrid, key: string, skip?: string): Promise<number> {
  const keys: Key[] = [];
  let gone = 0;
  let cur: string | undefined = key;
  for (let depth = 0; cur && depth < 30; depth++) {
    const s: Sess | undefined = await getSession(h, cur);
    if (!s) break;
    if (cur !== skip) {
      keys.push(K.session(cur));
      gone++;
      // Only the live end of a chain has a pointer (rotation moves it); deleting a missing one is harmless.
      if (!s.replacedBy) keys.push(K.listenerSessionPtr(s.listenerId, s.publicId));
      if (s.actingAdminId) keys.push(K.actAsPtr(s.actingAdminId, s.publicId));
    }
    cur = s.predecessor;
  }
  for (let i = 0; i < keys.length; i += 90) {
    const t = txa(h.store);
    for (const k of keys.slice(i, i + 90)) t.delete('main', k);
    await t.commit();
  }
  return gone;
}

export async function deleteSessionByHash(h: Hybrid, hash: Buffer | string): Promise<void> {
  await deleteSessionChain(h, hashKey(hash));
}

export async function sessionExistsRows(h: Hybrid, hash: Buffer): Promise<{ ok: number }[]> {
  return (await getSession(h, hashKey(hash))) ? [{ ok: 1 }] : [];
}

/** Secret rotation: the item moves to the new hash key; the pointer and both chain neighbours follow (ON UPDATE CASCADE). */
export async function rehashSession(h: Hybrid, cur: Buffer, from: Buffer): Promise<void> {
  const fromKey = hashKey(from);
  const curKey = hashKey(cur);
  const s = await getSession(h, fromKey);
  if (!s) return;
  const moved: Item = { ...s, PK: K.session(curKey).PK, tokenHash: curKey };
  const t = txa(h.store).put('main', moved, { condition: 'attribute_not_exists(PK)' }).delete('main', K.session(fromKey));
  if (!s.replacedBy) t.update('main', K.listenerSessionPtr(s.listenerId, s.publicId), { update: 'SET tokenHash = :k', condition: 'attribute_exists(PK)', values: { ':k': curKey } });
  if (s.actingAdminId) t.update('main', K.actAsPtr(s.actingAdminId, s.publicId), { update: 'SET tokenHash = :k', condition: 'attribute_exists(PK)', values: { ':k': curKey } });
  if (s.predecessor) t.update('main', K.session(s.predecessor), { update: 'SET replacedBy = :k', condition: 'attribute_exists(PK)', values: { ':k': curKey } });
  if (s.replacedBy) t.update('main', K.session(s.replacedBy), { update: 'SET predecessor = :k', condition: 'attribute_exists(PK)', values: { ':k': curKey } });
  try { await t.commit(); } catch (e) { if (!(e instanceof TxCancelled)) throw e; }
}

/** M25 SB rotation: of two racing requests one wins the condition on the old item; the other gets undefined. */
export async function rotateSessionRow(h: Hybrid, old: Buffer, fresh: string, freshHash: Buffer, ROTATE_EVERY_HOURS: number): Promise<string | undefined> {
  const oldKey = hashKey(old);
  const s = await getSession(h, oldKey);
  const now = nowMs(h);
  const cut = iso(now - ROTATE_EVERY_HOURS * 3_600_000);
  if (!s || s.replacedAt || s.actingAdminId || !(s.rotatedAt < cut)) return undefined;
  const newKey = hashKey(freshHash);
  const nowIso = iso(now);
  const { session, pointer } = await newSessionItems(h, newKey, s.listenerId, {
    deviceLabel: s.deviceLabel, country: s.country, createdAt: s.createdAt, now: nowIso, secondFactorAt: s.secondFactorAt ?? null, predecessor: oldKey,
  });
  const t = txa(h.store)
    .update('main', K.session(oldKey), {
      update: 'SET replacedAt = :now, replacedBy = :n, #ttl = :ttl',
      condition: 'attribute_exists(PK) AND attribute_not_exists(replacedAt) AND attribute_not_exists(actingAdminId) AND rotatedAt < :cut',
      names: { '#ttl': 'ttl' },
      values: { ':now': nowIso, ':n': newKey, ':cut': cut, ':ttl': ttlAfter(now, ROTATE_GRACE_SECONDS * 1000 + DAY_MS) },
      label: 'old',
    })
    .put('main', session, { condition: 'attribute_not_exists(PK)' })
    .put('main', pointer)
    .delete('main', K.listenerSessionPtr(s.listenerId, s.publicId));
  try {
    await t.commit();
  } catch (e) {
    if (e instanceof TxCancelled) return undefined;
    throw e;
  }
  return fresh;
}

/** The phone's auth check. One GetItem; a write only when lastSeenAt is 5 minutes old or the day's app use is not yet recorded. */
export async function listenerForTokenRows(h: Hybrid, hash: Buffer, _liveSql: string, SESSION_IDLE_DAYS: number, LAST_SEEN_EVERY_MINUTES: number): Promise<Listener[]> {
  const key = hashKey(hash);
  const s = await getSession(h, key);
  const now = nowMs(h);
  if (!s || s.actingAdminId || !live(s, now) || Date.parse(s.lastSeenAt) <= now - SESSION_IDLE_DAYS * DAY_MS) return [];
  const sets: string[] = [];
  const values: Record<string, unknown> = {};
  if (Date.parse(s.lastSeenAt) < now - LAST_SEEN_EVERY_MINUTES * 60_000) { sets.push('lastSeenAt = :now'); values[':now'] = iso(now); }
  const day = klDay(now);
  if (s.deviceLabel !== STUDIO && s.activeDay !== day) {
    // M18: the first use of the day is recorded once (a conditional marker), on the dashboard's day key.
    await unlessCondition(aput(h.store, 'events', encode('dailyActive', K.ev.dailyActive(day, s.listenerId), { day, listenerId: s.listenerId }, { ttl: ttlAfter(now, 400 * DAY_MS) }), { condition: 'attribute_not_exists(PK)' }));
    if (bridgeOn(h)) await recordDailyActive(h.pg, day, s.listenerId); // hybrid: lane SF's dashboard still reads Postgres (idempotent)
    sets.push('activeDay = :day'); values[':day'] = day;
  }
  if (sets.length > 0) await unlessCondition(upd(h.store, 'main', K.session(key), { update: `SET ${sets.join(', ')}`, condition: 'attribute_exists(PK)', values }));
  return [asListener(s)];
}

export async function studioSessionRows(h: Hybrid, hash: Buffer, STUDIO_LABEL: string, _liveSql: string): Promise<StudioSessionRow[]> {
  const s = await getSession(h, hashKey(hash));
  if (!s || s.deviceLabel !== STUDIO_LABEL || s.actingAdminId || !live(s, nowMs(h))) return [];
  return [{ ...asListener(s), last_seen_at: s.lastSeenAt }];
}

export async function touchSessionLastSeen(h: Hybrid, hash: Buffer): Promise<void> {
  await unlessCondition(upd(h.store, 'main', K.session(hashKey(hash)), { update: 'SET lastSeenAt = :now', condition: 'attribute_exists(PK)', values: { ':now': iso(nowMs(h)) } }));
}

export async function sessionCreatedAtRows(h: Hybrid, hash: Buffer): Promise<{ created_at: Date | string }[]> {
  const s = await getSession(h, hashKey(hash));
  return s ? [{ created_at: s.createdAt }] : [];
}

export async function deleteActAsSessions(h: Hybrid, adminId: string): Promise<void> {
  for (const p of await partitionItems(h, K.L(adminId), K.AC_SK.actAs)) {
    await deleteSessionChain(h, String(p['tokenHash']));
    await adel(h.store, 'main', { PK: String(p['PK']), SK: String(p['SK']) });
  }
}

export async function insertActAsSession(h: Hybrid, hash: Buffer, targetId: string, deviceLabel: string, adminId: string): Promise<void> {
  const now = iso(nowMs(h));
  const key = hashKey(hash);
  const { session, pointer, publicId } = await newSessionItems(h, key, targetId, { deviceLabel, country: null, createdAt: now, now, actingAdminId: adminId });
  await txa(h.store).put('main', session, { condition: 'attribute_not_exists(PK)' }).put('main', pointer)
    .put('main', encode('actAsPtr', K.actAsPtr(adminId, publicId), { tokenHash: key, targetId, createdAt: now })).commit();
}

export async function actingTargetRows(h: Hybrid, hash: Buffer, deviceLabel: string, adminId: string): Promise<(Listener & { created: Date | string })[]> {
  const s = await getSession(h, hashKey(hash));
  if (!s || s.deviceLabel !== deviceLabel || s.actingAdminId !== adminId) return [];
  if (!(await isAdminPg(h.pg, adminId))) return [];
  return [{ ...asListener(s), created: s.createdAt }];
}

// ---- the admin second factor, kept on the session item (patterns AC-41…AC-47) ----

export async function secondFactorAtRows(h: Hybrid, hash: Buffer): Promise<SecondFactorAtRow[]> {
  const s = await getSession(h, hashKey(hash));
  return s ? [{ second_factor_at: s.secondFactorAt ?? null }] : [];
}

const sessionUpdate = (h: Hybrid, hash: Buffer, u: string, values?: Record<string, unknown>) =>
  unlessCondition(upd(h.store, 'main', K.session(hashKey(hash)), { update: u, condition: 'attribute_exists(PK)', ...(values ? { values } : {}) }));

export async function markSecondFactorDone(h: Hybrid, hash: Buffer): Promise<void> {
  await sessionUpdate(h, hash, 'SET secondFactorAt = :now', { ':now': iso(nowMs(h)) });
}

export async function secondFactorSentAtRows(h: Hybrid, hash: Buffer): Promise<{ second_factor_sent_at: Date | string | null }[]> {
  const s = await getSession(h, hashKey(hash));
  return s ? [{ second_factor_sent_at: s.secondFactorSentAt ?? null }] : [];
}

export async function storeSecondFactorCode(h: Hybrid, hash: Buffer, codeHash: Buffer, sentAt: Date): Promise<void> {
  await sessionUpdate(h, hash, 'SET secondFactorCode = :c, secondFactorSentAt = :s, secondFactorTries = :z', { ':c': new Uint8Array(codeHash), ':s': sentAt.toISOString(), ':z': 0 });
}

export async function reserveSecondFactorTry(h: Hybrid, hash: Buffer, maxTries: number, sentAfter: Date): Promise<{ second_factor_code: Buffer | Uint8Array; second_factor_tries: number }[]> {
  const out = await unlessCondition(upd(h.store, 'main', K.session(hashKey(hash)), {
    update: 'SET secondFactorTries = if_not_exists(secondFactorTries, :z) + :one',
    condition: 'attribute_exists(PK) AND attribute_exists(secondFactorCode) AND secondFactorTries < :max AND secondFactorSentAt > :after',
    values: { ':z': 0, ':one': 1, ':max': maxTries, ':after': sentAfter.toISOString() },
    returnValues: 'ALL_NEW',
  }));
  if (!out) return [];
  return [{ second_factor_code: out['secondFactorCode'] as Uint8Array, second_factor_tries: Number(out['secondFactorTries']) }];
}

export async function passSecondFactor(h: Hybrid, hash: Buffer): Promise<void> {
  await sessionUpdate(h, hash, 'SET secondFactorAt = :now, secondFactorTries = :z REMOVE secondFactorCode', { ':now': iso(nowMs(h)), ':z': 0 });
}

export async function clearSecondFactorCode(h: Hybrid, hash: Buffer): Promise<void> {
  await sessionUpdate(h, hash, 'REMOVE secondFactorCode');
}
