// The listener's own profile, interests, stickers and synced queue on DynamoDB.
/**
 * M26 lane AC (AC-T05; patterns AC-07…AC-23, AC-100, AC-136…AC-138). Profile fields live on the
 * listener item; interests, stickers and the queue are singleton items in the listener partition
 * (`INTERESTS`, `STICKERS` — the ≤ 10 placements as one list, so a replace is one Put — and `QUEUE`,
 * whose `version` is the optimistic lock: `attribute_not_exists(PK)` for version 0, else `version = :base`,
 * guard G-M22-3). All photo bytes together are one counter (`CFG#bytes.avatarBytes`, data-model §7 B),
 * moved in the same transaction as the listener's own `avatarBytes`.
 */
import { randomUUID } from 'node:crypto';
import type { Placement } from '@socialmorning/social-core';
import { SYNCED_QUEUE_MAX } from '@socialmorning/social-core';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, put, update } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { isConditionFailed, withVersionRetry } from '../../../ddb/retry.ts';
import { ApiError } from '../../../../errors.ts';
import { acceptRules as acceptRulesDual, setAvatar as setAvatarDual, updateProfile as updateProfileDual, type MyProfile, type ProfilePatch } from '../profile.ts';
import { cleanGenreIds, type Interests, type RecFeedbackIn } from '../interests.ts';
import type { SyncedQueue } from '../queue.ts';
import { setTz as setTzDual, validTz } from '../digest.ts';
import { getListener, iso, nowMs, plainPg, refreshSessionCopies, unlessCondition, upd, aput, txa, type Hybrid, bridgeOn } from './common.ts';
import { listenedEpisodeCount } from './foreign.ts';

export async function myProfile(h: Hybrid, id: string): Promise<MyProfile> {
  const r = await getListener(h, id);
  return {
    ...(r?.avatarUrl ? { avatarUrl: r.avatarUrl } : {}), ...(r?.bio ? { bio: r.bio } : {}),
    ...(r?.ageRange ? { ageRange: r.ageRange } : {}), ...(r?.gender ? { gender: r.gender } : {}),
    likesPublic: r?.likesPublic ?? true, privateListening: r?.privateListening ?? false,
    ...(r?.birthday ? { birthday: r.birthday } : {}), ...(r?.industry ? { industry: r.industry } : {}),
    hideBadge: r?.hideBadge ?? false, hideStickers: r?.hideStickers ?? false, hideDecorations: r?.hideDecorations ?? false,
    privateSubscriptions: r?.privateSubscriptions ?? false,
  };
}

export async function updateProfile(h: Hybrid, id: string, p: ProfilePatch): Promise<void> {
  const sets: string[] = [];
  const removes: string[] = [];
  const values: Record<string, unknown> = {};
  const set = (attr: string, v: unknown) => {
    if (v === null || v === undefined) { removes.push(attr); return; }
    values[`:${attr}`] = v;
    sets.push(`${attr} = :${attr}`);
  };
  if (p.displayName !== undefined) {
    set('displayName', p.displayName);
    const g = K.G6(p.displayName, id);
    values[':g6pk'] = g.G6PK; values[':g6sk'] = g.G6SK;
    sets.push('G6PK = :g6pk', 'G6SK = :g6sk');
  }
  if (p.bio !== undefined) set('bio', p.bio === '' ? null : p.bio);
  if (p.ageRange !== undefined) set('ageRange', p.ageRange);
  if (p.gender !== undefined) set('gender', p.gender);
  if (p.likesPublic !== undefined) set('likesPublic', p.likesPublic);
  if (p.birthday !== undefined) set('birthday', p.birthday);
  if (p.industry !== undefined) set('industry', p.industry === '' ? null : p.industry);
  if (p.hideBadge !== undefined) set('hideBadge', p.hideBadge);
  if (p.hideStickers !== undefined) set('hideStickers', p.hideStickers);
  if (p.hideDecorations !== undefined) set('hideDecorations', p.hideDecorations);
  if (p.privateSubscriptions !== undefined) set('privateSubscriptions', p.privateSubscriptions);
  if (sets.length === 0 && removes.length === 0) return;
  const expr = [sets.length ? `SET ${sets.join(', ')}` : '', removes.length ? `REMOVE ${removes.join(', ')}` : ''].filter(Boolean).join(' ');
  await unlessCondition(upd(h.store, 'main', K.listener(id), { update: expr, condition: 'attribute_exists(PK)', ...(Object.keys(values).length ? { values } : {}) }));
  if (p.displayName !== undefined) await refreshSessionCopies(h, id);
  if (bridgeOn(h)) await updateProfileDual(plainPg(h), id, p); // shadow
}

const BYTES = K.config('bytes');

/** Every photo's bytes but this listener's: the global counter minus their own (data-model §7 B). */
export async function avatarBytesOthers(h: Hybrid, id: string): Promise<number> {
  const [total, mine] = await Promise.all([get(h.store, 'main', BYTES), getListener(h, id)]);
  return Math.max(0, Number(total?.['avatarBytes'] ?? 0) - Number(mine?.avatarBytes ?? 0));
}

export async function currentAvatar(h: Hybrid, id: string): Promise<string | undefined> {
  return (await getListener(h, id))?.avatarUrl ?? undefined;
}

/** The listener's photo and the global byte counter move together; a racing change retries. */
export async function setAvatar(h: Hybrid, id: string, a: { url: string; path: string; bytes: number } | null): Promise<void> {
  await withVersionRetry(async () => {
    const l = await getListener(h, id);
    if (!l) return;
    const old = Number(l.avatarBytes ?? 0);
    const next = a?.bytes ?? 0;
    const t = txa(h.store).update('main', K.listener(id), a
      ? { update: 'SET avatarUrl = :u, avatarPath = :p, avatarBytes = :b', condition: l.avatarBytes === undefined ? 'attribute_not_exists(avatarBytes)' : 'avatarBytes = :old', values: { ':u': a.url, ':p': a.path, ':b': a.bytes, ...(l.avatarBytes === undefined ? {} : { ':old': old }) } }
      : { update: 'REMOVE avatarUrl, avatarPath, avatarBytes', condition: l.avatarBytes === undefined ? 'attribute_not_exists(avatarBytes)' : 'avatarBytes = :old', ...(l.avatarBytes === undefined ? {} : { values: { ':old': old } }) });
    if (next !== old) t.update('main', BYTES, { update: 'SET #t = :t ADD avatarBytes :d', names: { '#t': 't' }, values: { ':t': 'config', ':d': next - old } });
    await t.commit();
  });
  if (bridgeOn(h)) await setAvatarDual(plainPg(h), id, a); // shadow
}

export async function displayNameRows(h: Hybrid, listenerId: string): Promise<{ display_name: string }[]> {
  const l = await getListener(h, listenerId);
  return l ? [{ display_name: l.displayName }] : [];
}

export async function acceptRules(h: Hybrid, listenerId: string): Promise<void> {
  await unlessCondition(upd(h.store, 'main', K.listener(listenerId), {
    update: 'SET rulesAcceptedAt = if_not_exists(rulesAcceptedAt, :now)', condition: 'attribute_exists(PK)', values: { ':now': iso(nowMs(h)) },
  }));
  if (bridgeOn(h)) await acceptRulesDual(plainPg(h), listenerId); // shadow
}

export async function passwordHashRows(h: Hybrid, listenerId: string): Promise<{ password_hash: string }[]> {
  const l = await getListener(h, listenerId);
  return l ? [{ password_hash: l.passwordHash }] : [];
}

export async function listenerEmailRows(h: Hybrid, listenerId: string): Promise<{ email: string }[]> {
  const l = await getListener(h, listenerId);
  return l ? [{ email: l.email }] : [];
}

export async function setTz(h: Hybrid, listenerId: string, tz: string): Promise<void> {
  if (!validTz(tz)) throw new ApiError('validation', 'That is not a time zone.', { fields: ['tz'] });
  await unlessCondition(upd(h.store, 'main', K.listener(listenerId), { update: 'SET tz = :tz', condition: 'attribute_exists(PK)', values: { ':tz': tz } }));
  if (bridgeOn(h)) await setTzDual(plainPg(h), listenerId, tz); // shadow
}

// ---- interests (AC-12…AC-18) ----

const INTERESTS = (id: string) => K.listenerSingleton(id, 'INTERESTS');

export async function getInterests(h: Hybrid, listenerId: string): Promise<Interests> {
  const r = await get(h.store, 'main', INTERESTS(listenerId));
  if (!r) return { genreIds: [], skippedAt: null };
  return { genreIds: ((r['genreIds'] as number[] | undefined) ?? []).map(Number), skippedAt: (r['skippedAt'] as string | null | undefined) ?? null };
}

export async function setInterests(h: Hybrid, listenerId: string, genreIds: readonly number[]): Promise<void> {
  await aput(h.store, 'main', encode('interests', INTERESTS(listenerId), { genreIds: [...genreIds], skippedAt: null, updatedAt: iso(nowMs(h)) }));
}

export async function skipInterests(h: Hybrid, listenerId: string): Promise<void> {
  const now = iso(nowMs(h));
  await upd(h.store, 'main', INTERESTS(listenerId), {
    update: 'SET #t = :t, genreIds = if_not_exists(genreIds, :empty), skippedAt = :now, updatedAt = :now',
    names: { '#t': 't' }, values: { ':t': 'interests', ':empty': [], ':now': now },
  });
}

export async function addRecFeedback(h: Hybrid, listenerId: string, f: RecFeedbackIn): Promise<void> {
  const now = iso(nowMs(h));
  await aput(h.store, 'main', encode('recFeedback', K.recFeedback(listenerId, now, randomUUID()), { reason: f.reason, note: f.note?.trim() || null, createdAt: now }));
  const add = cleanGenreIds(f.add ?? []);
  const remove = new Set(f.remove ?? []);
  if (add.length === 0 && remove.size === 0) return;
  const cur = await getInterests(h, listenerId);
  const next = cleanGenreIds([...cur.genreIds.filter((g) => !remove.has(g)), ...add]);
  await upd(h.store, 'main', INTERESTS(listenerId), {
    update: 'SET #t = :t, genreIds = :g, updatedAt = :now, skippedAt = if_not_exists(skippedAt, :null)',
    names: { '#t': 't' }, values: { ':t': 'interests', ':g': next, ':now': now, ':null': null },
  });
}

export async function interestsStamp(h: Hybrid, listenerId: string): Promise<string> {
  const r = await get(h.store, 'main', INTERESTS(listenerId));
  return (r?.['updatedAt'] as string | undefined) ?? '-';
}

/** Lane SG's activity log is still on Postgres (foreign.ts); LB's `listenedCount` replaces this when it moves. */
export async function playCount(h: Hybrid, listenerId: string): Promise<number> {
  return listenedEpisodeCount(h.pg, listenerId);
}

// ---- stickers (AC-19…AC-21): the ≤ 10 placements as one list ----

const STICKERS = (id: string) => K.listenerSingleton(id, 'STICKERS');

export async function placementsFor(h: Hybrid, listenerId: string): Promise<Placement[]> {
  const r = await get(h.store, 'main', STICKERS(listenerId));
  const items = ((r?.['items'] as Placement[] | undefined) ?? []).map((p) => ({ stickerId: p.stickerId, x: Number(p.x), y: Number(p.y), scale: Number(p.scale), rot: Number(p.rot), z: Number(p.z) }));
  return items.sort((a, b) => a.z - b.z || (a.stickerId < b.stickerId ? -1 : a.stickerId > b.stickerId ? 1 : 0));
}

export async function replacePlacements(h: Hybrid, listenerId: string, items: readonly Placement[]): Promise<void> {
  await aput(h.store, 'main', encode('stickers', STICKERS(listenerId), { items: items.map((p) => ({ stickerId: p.stickerId, x: p.x, y: p.y, scale: p.scale, rot: p.rot, z: p.z })) }));
}

export async function stickerView(h: Hybrid, listenerId: string, viewerId: string | undefined): Promise<{ stickers: Placement[]; stickersHidden?: true }> {
  const l = await getListener(h, listenerId);
  const stickers = l?.hideDecorations ? [] : await placementsFor(h, listenerId);
  return { stickers, ...(l?.hideStickers && viewerId !== listenerId ? { stickersHidden: true as const } : {}) };
}

// ---- the synced queue (AC-22, AC-23; guard G-M22-3) ----

const QUEUE = (id: string) => K.listenerSingleton(id, 'QUEUE');

const toQueue = (r: Record<string, unknown> | undefined): SyncedQueue => (!r ? { items: [], version: 0, deviceId: null, updatedAt: null }
  : { items: ((r['items'] as unknown[] | undefined) ?? []).filter((x): x is string => typeof x === 'string'), version: Number(r['version'] ?? 0), deviceId: (r['deviceId'] as string | null | undefined) ?? null, updatedAt: (r['updatedAt'] as string | undefined) ?? null });

export async function getQueue(h: Hybrid, listenerId: string): Promise<SyncedQueue> {
  return toQueue(await get(h.store, 'main', QUEUE(listenerId)));
}

export async function putQueue(h: Hybrid, listenerId: string, items: readonly string[], baseVersion: number, deviceId: string): Promise<{ ok: true; version: number } | { ok: false; current: SyncedQueue }> {
  const current = await getQueue(h, listenerId);
  if (current.version !== baseVersion) return { ok: false, current };
  const version = baseVersion + 1;
  try {
    await aput(h.store, 'main', encode('queue', QUEUE(listenerId), { items: items.slice(0, SYNCED_QUEUE_MAX), version, deviceId, updatedAt: iso(nowMs(h)) }), {
      condition: baseVersion === 0 ? 'attribute_not_exists(PK)' : 'version = :base',
      ...(baseVersion === 0 ? {} : { values: { ':base': baseVersion } }),
    });
  } catch (e) {
    if (isConditionFailed(e)) return { ok: false, current: await getQueue(h, listenerId) };
    throw e;
  }
  return { ok: true, version };
}
