// Social-graph test helpers: seed, age and count follows, activity, notifications and live listeners (DynamoDB items).
/**
 * M26 lane SG. The graph tests seed, age and count follows, activity, notifications, live listeners and listener
 * switches. Each helper reads/writes the items (DynamoDB modules loaded dynamically).
 */
import assert from 'node:assert/strict';
import type { TestDb } from './harness.ts';

type Row = Record<string, unknown>;
const fx = () => import('./fixtures.ts');
const keys = () => import('../src/db/ddb/keys.ts');
const keyOf = (i: Row) => ({ PK: String(i['PK']), SK: String(i['SK']) });
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function setAttr(t: TestDb, table: 'main' | 'events', key: { PK: string; SK: string }, attr: string, value: unknown): Promise<void> {
  const { update } = await import('../src/db/ddb/store.ts');
  await update(t.store, table, key, { update: 'SET #a = :v', condition: 'attribute_exists(PK)', names: { '#a': attr }, values: { ':v': value } });
}

/** How many follow rows (edges) exist. */
export async function followCount(t: TestDb): Promise<number> {
  return (await fx()).acCount(t.store, 'main', 'follow');
}

/** G4: a self-follow can never be stored — the repo refuses it. */
export async function assertSelfFollowRefused(t: TestDb, id: string): Promise<void> {
  const { follow } = await import('../src/db/repos/social/follows.ts');
  assert.equal(await follow(t.db, id, id), 'self');
  assert.equal(await (await fx()).acHasItem(t.store, (await keys()).follow(id, id)), false);
}

/** Every listen of `actorId` is `ms` old (replaces `UPDATE listened_ranges SET updated_at = now() - …`). */
export async function ageListens(t: TestDb, actorId: string, ms: number): Promise<void> {
  const f = await fx();
  for (const i of await f.acScan(t.store, 'events', 'friendsListening')) if (i['actorId'] === actorId) await setAttr(t, 'events', keyOf(i), 'at', ago(ms));
  for (const i of await f.acScan(t.store, 'events', 'recentListen')) if (String(i['PK']) === `LR#${actorId}`) await setAttr(t, 'events', keyOf(i), 'at', ago(ms));
}

/** The listened activity rows written hidden (private listening at the time). */
export async function hiddenListenCount(t: TestDb): Promise<number> {
  return (await (await fx()).acScan(t.store, 'events', 'activity')).filter((a) => a['kind'] === 'listened' && a['hidden'] === true).length;
}

// ---- live listeners (G-L1) ----

/** What a live-listener row may hold: the item type's strict allowlist (snake_case). */
export async function liveColumns(_t: TestDb): Promise<string[]> {
  const { ITEM_TYPES, STRICT_TYPES } = await import('../src/db/ddb/codec.ts');
  assert.ok(STRICT_TYPES.includes('liveListener'), 'the live-listener item type is strict');
  return [...(ITEM_TYPES.liveListener.attrs as readonly string[])].map((a) => a.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)).sort();
}

/** Every stored live-listener row, whole (every attribute of the item, keys included). */
export async function liveRows(t: TestDb): Promise<Row[]> {
  return (await (await fx()).acScan(t.store, 'events', 'liveListener')).map((i) => ({ ...i, listener_hash: i['listenerHash'] }));
}

export const liveCount = async (t: TestDb): Promise<number> => (await liveRows(t)).length;

/** Every live-listener row was seen `ms` ago. */
export async function ageLive(t: TestDb, ms: number): Promise<void> {
  for (const i of await (await fx()).acScan(t.store, 'events', 'liveListener')) await setAttr(t, 'events', keyOf(i), 'seenAt', ago(ms));
}

/** Whether the (one) live-listener row was seen more than `ms` ago. */
export async function liveOlderThan(t: TestDb, ms: number): Promise<boolean> {
  const [r] = await liveRows(t);
  assert.ok(r, 'a live-listener row exists');
  return Date.parse(String(r['seenAt'])) < Date.now() - ms;
}

/** A live-listener row for `hash`, seen `ms` ago. */
export async function seedLive(t: TestDb, episodeId: string, hash: string, ms: number): Promise<void> {
  const { liveItem } = await import('../src/db/repos/social/graph-ddb/live.ts');
  const { put } = await import('../src/db/ddb/store.ts');
  await put(t.store, 'events', liveItem(episodeId, hash, Date.now() - ms));
}

// ---- notifications ----

/** How many notices a listener has stored. */
export async function noticeCount(t: TestDb, recipientId: string): Promise<number> {
  return (await (await fx()).acScan(t.store, 'main', 'notification')).filter((n) => n['recipientId'] === recipientId).length;
}

/** Moves every notice of a listener `ms` earlier (the sort key carries the time, so the item is re-keyed). */
export async function shiftNotices(t: TestDb, recipientId: string, ms: number): Promise<void> {
  const K = await keys();
  const { put, del } = await import('../src/db/ddb/store.ts');
  for (const n of await (await fx()).acScan(t.store, 'main', 'notification')) {
    if (n['recipientId'] !== recipientId) continue;
    const createdAt = new Date(Date.parse(String(n['createdAt'])) - ms).toISOString();
    await del(t.store, 'main', keyOf(n));
    await put(t.store, 'main', { ...n, ...K.notification(recipientId, createdAt, String(n['id'])), createdAt });
  }
}

/** Moves a listener's "notifications seen" time `ms` earlier. */
export async function shiftSeenAt(t: TestDb, id: string, ms: number): Promise<void> {
  const l = await (await fx()).itemAt(t.store, 'listener', (await keys()).listener(id));
  await setAttr(t, 'main', (await keys()).listener(id), 'notificationsSeenAt', new Date(Date.parse(String(l!['notificationsSeenAt'])) - ms).toISOString());
}

/** `n` follow notices from `actorId` to `recipientId`, 1 … n seconds old (the paging seed). */
export async function seedFollowNotices(t: TestDb, recipientId: string, actorId: string, n: number): Promise<void> {
  const K = await keys();
  const { encode } = await import('../src/db/ddb/codec.ts');
  const { put } = await import('../src/db/ddb/store.ts');
  const { randomUUID } = await import('node:crypto');
  for (let g = 1; g <= n; g++) {
    const id = randomUUID();
    const createdAt = ago(g * 1000);
    await put(t.store, 'main', encode('notification', K.notification(recipientId, createdAt, id), { id, recipientId, actorId, kind: 'follow', ref: {}, createdAt }));
  }
}

// ---- listener fields ----

/** Suspends a listener: the listener item's `suspendedAt`. */
export async function suspend(t: TestDb, id: string): Promise<void> {
  await setAttr(t, 'main', (await keys()).listener(id), 'suspendedAt', new Date().toISOString());
}
