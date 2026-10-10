// Signed-in devices, the email change and "Download my data" on DynamoDB.
/**
 * M26 lane AC (AC-T03, AC-T08; patterns AC-78…AC-99, AC-124…AC-135).
 * - Devices: the listener's `SESS#` pointers (strongly consistent) → BatchGet of the session items; "this
 *   phone" is the caller's token or the token that replaced it (a rotated phone still in its grace window).
 * - Email change: `L#<id>/EMAILCHG` (tries reserved by a conditional ADD). The switch is ONE transaction:
 *   claim `U#EMAIL#<new>` (attribute_not_exists — another account cannot take it in between), release
 *   `U#EMAIL#<old>`, the listener's email, the pending change, both addresses' codes (6 items). The other
 *   sessions are then signed out (a listener's sessions are unbounded, so not in the transaction) and the
 *   kept session's copy of the email is refreshed.
 * - Export: the listener's own items (profile, queue, devices) from DynamoDB, in the old file format
 *   (snake_case names, the same secret filter); the other lanes' sections from Postgres (foreign.ts).
 */
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { get, type Item } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { claimUnique } from '../../../ddb/unique.ts';
import { SESSION_MAX_DAYS } from '../../../../auth/session.ts';
import type { DeviceRow } from '../devices.ts';
import type { EmailChangeTry } from '../email-change.ts';
import { SECTIONS } from '../data-export.ts';
import { adel, aput, DAY_MS, getListener, hashKey, iso, nowMs, partitionItems, refreshSessionCopies, txa, unlessCondition, upd, type Hybrid, bridgeOn } from './common.ts';
import { exportSection, shadowListener } from './foreign.ts';
import { GRAPH_SECTIONS, graphExportSection } from '../../social/graph-ddb/export.ts';
import { deleteSessionChain, getSession } from './sessions.ts';

type SessItem = Item & { tokenHash: string; publicId: string; deviceLabel: string | null; country: string | null; createdAt: string; lastSeenAt: string; replacedAt?: string; replacedBy?: string; actingAdminId?: string };

/** The listener's sessions (not act-as), each with its pointer's public id. */
async function liveSessions(h: Hybrid, listenerId: string): Promise<SessItem[]> {
  const ptrs = (await partitionItems(h, K.L(listenerId), K.LISTENER_SK.sessions)).filter((p) => !p['actingAdminId']);
  const items = await batchGetAll(h.store, 'main', ptrs.map((p) => K.session(String(p['tokenHash']))));
  return items as SessItem[];
}

export async function listDeviceRows(h: Hybrid, listenerId: string, hash: Buffer, idleDays: number, _liveSql: string): Promise<DeviceRow[]> {
  const me = hashKey(hash);
  const mine = await getSession(h, me);
  const now = nowMs(h);
  const rows = (await liveSessions(h, listenerId))
    .filter((s) => !s.actingAdminId && !s.replacedAt
      && Date.parse(s.lastSeenAt) > now - idleDays * DAY_MS && Date.parse(s.createdAt) > now - SESSION_MAX_DAYS * DAY_MS)
    .map((s): DeviceRow => ({ id: s.publicId, device_label: s.deviceLabel ?? null, country: s.country ?? null, created_at: s.createdAt, last_seen_at: s.lastSeenAt, current: s.tokenHash === me || s.tokenHash === mine?.replacedBy }));
  rows.sort((a, b) => Number(b.current) - Number(a.current) || (String(a.last_seen_at) < String(b.last_seen_at) ? 1 : String(a.last_seen_at) > String(b.last_seen_at) ? -1 : 0));
  return rows.slice(0, 100);
}

export async function deviceCurrentRows(h: Hybrid, id: string, listenerId: string, hash: Buffer): Promise<{ current: boolean }[]> {
  const p = await get(h.store, 'main', K.listenerSessionPtr(listenerId, id));
  if (!p || p['actingAdminId']) return [];
  const me = hashKey(hash);
  const mine = await getSession(h, me);
  return [{ current: p['tokenHash'] === me || p['tokenHash'] === mine?.replacedBy }];
}

export async function deleteDevice(h: Hybrid, id: string, listenerId: string): Promise<void> {
  const p = await get(h.store, 'main', K.listenerSessionPtr(listenerId, id));
  if (p) await deleteSessionChain(h, String(p['tokenHash']));
}

/** Keeps this token, the token that replaced it, and whatever points at either; signs out the rest. */
export async function signOutOtherDevices(h: Hybrid, listenerId: string, hash: Buffer): Promise<{ id: string }[]> {
  const me = hashKey(hash);
  const mine = await getSession(h, me);
  const keep = new Set([me, ...(mine?.replacedBy ? [mine.replacedBy] : [])]);
  const gone: { id: string }[] = [];
  for (const s of await liveSessions(h, listenerId)) {
    if (keep.has(s.tokenHash) || (s.replacedBy && keep.has(s.replacedBy))) continue;
    const n = await deleteSessionChain(h, s.tokenHash);
    for (let i = 0; i < n; i++) gone.push({ id: s.publicId });
  }
  return gone;
}

// ---- the email change (AC-124…AC-131) ----

const EMAILCHG = (id: string) => K.listenerSingleton(id, 'EMAILCHG');

export async function pendingEmailChangeRows(h: Hybrid, listenerId: string): Promise<{ sent_at: Date | string }[]> {
  const c = await get(h.store, 'main', EMAILCHG(listenerId));
  return c ? [{ sent_at: String(c['sentAt']) }] : [];
}

export async function saveEmailChange(h: Hybrid, listenerId: string, to: string, codeHash: Buffer, oldCodeHash: Buffer, sentAt: Date, expiresAt: Date): Promise<void> {
  await aput(h.store, 'main', encode('emailChange', EMAILCHG(listenerId), {
    newEmail: to, codeHash: new Uint8Array(codeHash), oldCodeHash: new Uint8Array(oldCodeHash), sentAt: sentAt.toISOString(), expiresAt: expiresAt.toISOString(), tries: 0,
  }, { ttl: ttlAfter(expiresAt.getTime(), DAY_MS) }));
}

export async function takeEmailChangeTry(h: Hybrid, listenerId: string, maxAttempts: number, now: Date): Promise<EmailChangeTry[]> {
  const out = await unlessCondition(upd(h.store, 'main', EMAILCHG(listenerId), {
    update: 'ADD tries :one', condition: 'attribute_exists(PK) AND tries < :max AND expiresAt > :now',
    values: { ':one': 1, ':max': maxAttempts, ':now': now.toISOString() }, returnValues: 'ALL_NEW',
  }));
  if (!out) return [];
  return [{ new_email: String(out['newEmail']), code_hash: out['codeHash'] as Uint8Array, old_code_hash: (out['oldCodeHash'] as Uint8Array | undefined) ?? null, tries: Number(out['tries']) }];
}

export async function deleteEmailChange(h: Hybrid, listenerId: string): Promise<void> {
  await adel(h.store, 'main', EMAILCHG(listenerId));
}

export async function switchEmail(h: Hybrid, listenerId: string, old: string, to: string, keep: Buffer): Promise<false | { signedOut: number }> {
  const t = txa(h.store)
    .update('main', K.listener(listenerId), { update: 'SET email = :to', condition: 'attribute_exists(PK)', values: { ':to': to } })
    .delete('main', K.U.email(old), { condition: 'attribute_not_exists(PK) OR owner = :me', values: { ':me': listenerId } })
    .delete('main', EMAILCHG(listenerId))
    .delete('main', K.emailCode(old))
    .delete('main', K.emailCode(to));
  claimUnique(t.raw, K.U.email(to), listenerId);
  try {
    await t.commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('unique:EMAIL')) return false;
    throw e;
  }
  if (bridgeOn(h)) await shadowListener(h.pg, listenerId, 'email', to);
  // Fix F-S (G-M24-FS-2): every other session of this account is signed out; this one stays.
  const keepKey = hashKey(keep);
  let signedOut = 0;
  for (const p of await partitionItems(h, K.L(listenerId), K.LISTENER_SK.sessions)) {
    if (p['tokenHash'] === keepKey) continue;
    signedOut += await deleteSessionChain(h, String(p['tokenHash']), keepKey);
  }
  await refreshSessionCopies(h, listenerId);
  return { signedOut };
}

// ---- "Download my data" (AC-78…AC-99) ----

const SECRET = /(password|token|hash|secret|_path$|^failed_attempts$|^locked_until$|^second_factor)/;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** An item in the old file's shape: snake_case names, no key/index/TTL attributes, no secrets, no bytes. */
function cleanItem(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (/^(PK|SK|t|ttl|G[1-6](PK|SK)|E1(PK|SK))$/.test(k)) continue;
    const name = snake(k);
    if (SECRET.test(name) || v instanceof Uint8Array) continue;
    out[name] = v;
  }
  return out;
}

function cleanRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET.test(k) || v instanceof Uint8Array) continue;
    out[k] = typeof v === 'bigint' ? v.toString() : v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

export async function exportData(h: Hybrid, listenerId: string, now = new Date()): Promise<Record<string, unknown>> {
  const profile = await getListener(h, listenerId);
  const out: Record<string, unknown> = { exportedAt: now.toISOString(), format: 'socialnet-export-1', profile: profile ? cleanItem(profile) : null };
  for (const [name, sql] of SECTIONS) {
    if (name === 'queue') {
      const q = await get(h.store, 'main', K.listenerSingleton(listenerId, 'QUEUE'));
      out[name] = q ? [{ listener_id: listenerId, ...cleanItem(q) }] : [];
    } else if (name === 'devices') {
      out[name] = (await liveSessions(h, listenerId))
        .filter((s) => !s.replacedAt) // as the old SQL: acting_admin_id IS NULL AND replaced_at IS NULL
        .map((s) => ({ device_label: s.deviceLabel ?? null, country: s.country ?? null, created_at: s.createdAt, last_seen_at: s.lastSeenAt }));
    } else if (GRAPH_SECTIONS.has(name)) {
      out[name] = (await graphExportSection(h, name, listenerId)).map(cleanRow); // lane SG's items (follows, playlists)
    } else {
      out[name] = (await exportSection(h.pg, sql, listenerId)).map(cleanRow);
    }
  }
  return out;
}

