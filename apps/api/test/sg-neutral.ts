// Social-graph test helpers that work on both backends: Postgres SQL today, DynamoDB items when the test runs hybrid (TEST_BACKEND=ddb).
/**
 * M26 lane SG (tasks.md "convert the lane's test files from t.q() to fixtures"). The graph tests seed, age and
 * count follows, activity, notifications, live listeners and listener switches. Those rows live in Postgres on the
 * gate and in DynamoDB under ddb-api.yml, so each helper does the same thing on whichever backend `t` runs: with
 * `t.store` it reads/writes items (DynamoDB modules loaded dynamically, so the Postgres coverage run never loads
 * them), otherwise the SQL the test used to inline. Rows of lanes still on Postgres (blocks, comments, voice posts,
 * claims) stay `t.q` in the tests. CUT deletes the Postgres branches.
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
  await update(t.store!, table, key, { update: 'SET #a = :v', condition: 'attribute_exists(PK)', names: { '#a': attr }, values: { ':v': value } });
}

/** How many follow rows (edges) exist. */
export async function followCount(t: TestDb): Promise<number> {
  if (t.store) return (await fx()).acCount(t.store, 'main', 'follow');
  return Number((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM follows'))[0]!.n);
}

/** G4: a self-follow can never be stored — the table's CHECK on Postgres, the repo's refusal on DynamoDB. */
export async function assertSelfFollowRefused(t: TestDb, id: string): Promise<void> {
  if (t.store) {
    const { follow } = await import('../src/db/repos/social/follows.ts');
    assert.equal(await follow(t.db, id, id), 'self');
    assert.equal(await (await fx()).acHasItem(t.store, (await keys()).follow(id, id)), false);
    return;
  }
  await assert.rejects(t.q('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $1)', [id]), /check/i);
}

/** Every listen of `actorId` is `ms` old (replaces `UPDATE listened_ranges SET updated_at = now() - …`). */
export async function ageListens(t: TestDb, actorId: string, ms: number): Promise<void> {
  if (t.store) {
    const f = await fx();
    for (const i of await f.acScan(t.store, 'events', 'friendsListening')) if (i['actorId'] === actorId) await setAttr(t, 'events', keyOf(i), 'at', ago(ms));
    for (const i of await f.acScan(t.store, 'events', 'recentListen')) if (String(i['PK']) === `LR#${actorId}`) await setAttr(t, 'events', keyOf(i), 'at', ago(ms));
    return;
  }
  await t.q(`UPDATE listened_ranges SET updated_at = now() - ($2::text || ' milliseconds')::interval WHERE listener_id = $1`, [actorId, String(ms)]);
}

/** The listened activity rows written hidden (private listening at the time). */
export async function hiddenListenCount(t: TestDb): Promise<number> {
  if (t.store) return (await (await fx()).acScan(t.store, 'events', 'activity')).filter((a) => a['kind'] === 'listened' && a['hidden'] === true).length;
  return Number((await t.q<{ n: number }>(`SELECT count(*)::int AS n FROM activity WHERE kind = 'listened' AND hidden`))[0]!.n);
}

// ---- live listeners (G-L1) ----

/** What a live-listener row may hold: the table's columns on Postgres, the item type's strict allowlist on DynamoDB (snake_case). */
export async function liveColumns(t: TestDb): Promise<string[]> {
  if (t.store) {
    const { ITEM_TYPES, STRICT_TYPES } = await import('../src/db/ddb/codec.ts');
    assert.ok(STRICT_TYPES.includes('liveListener'), 'the live-listener item type is strict');
    return [...(ITEM_TYPES.liveListener.attrs as readonly string[])].map((a) => a.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)).sort();
  }
  return (await t.q<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'live_listeners' ORDER BY column_name")).map((c) => c.column_name);
}

/** Every stored live-listener row, whole (on DynamoDB: every attribute of the item, keys included). */
export async function liveRows(t: TestDb): Promise<Row[]> {
  if (t.store) return (await (await fx()).acScan(t.store, 'events', 'liveListener')).map((i) => ({ ...i, listener_hash: i['listenerHash'] }));
  return t.q<Row>('SELECT * FROM live_listeners ORDER BY listener_hash');
}

export const liveCount = async (t: TestDb): Promise<number> => (await liveRows(t)).length;

/** Every live-listener row was seen `ms` ago. */
export async function ageLive(t: TestDb, ms: number): Promise<void> {
  if (t.store) {
    for (const i of await (await fx()).acScan(t.store, 'events', 'liveListener')) await setAttr(t, 'events', keyOf(i), 'seenAt', ago(ms));
    return;
  }
  await t.q(`UPDATE live_listeners SET seen_at = now() - ($1::text || ' milliseconds')::interval`, [String(ms)]);
}

/** Whether the (one) live-listener row was seen more than `ms` ago. */
export async function liveOlderThan(t: TestDb, ms: number): Promise<boolean> {
  const [r] = await liveRows(t);
  assert.ok(r, 'a live-listener row exists');
  return Date.parse(String(t.store ? r['seenAt'] : new Date(r['seen_at'] as string).toISOString())) < Date.now() - ms;
}

/** A live-listener row for `hash`, seen `ms` ago. */
export async function seedLive(t: TestDb, episodeId: string, hash: string, ms: number): Promise<void> {
  if (t.store) {
    const { liveItem } = await import('../src/db/repos/social/graph-ddb/live.ts');
    const { put } = await import('../src/db/ddb/store.ts');
    await put(t.store, 'events', liveItem(episodeId, hash, Date.now() - ms));
    return;
  }
  await t.q(`INSERT INTO live_listeners (episode_id, listener_hash, seen_at) VALUES ($1, $2, now() - ($3::text || ' milliseconds')::interval)`, [episodeId, hash, String(ms)]);
}

// ---- notifications ----

/** How many notices a listener has stored. */
export async function noticeCount(t: TestDb, recipientId: string): Promise<number> {
  if (t.store) return (await (await fx()).acScan(t.store, 'main', 'notification')).filter((n) => n['recipientId'] === recipientId).length;
  return Number((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE recipient_id = $1', [recipientId]))[0]!.n);
}

/** Moves every notice of a listener `ms` earlier (the sort key carries the time, so the item is re-keyed). */
export async function shiftNotices(t: TestDb, recipientId: string, ms: number): Promise<void> {
  if (t.store) {
    const K = await keys();
    const { put, del } = await import('../src/db/ddb/store.ts');
    for (const n of await (await fx()).acScan(t.store, 'main', 'notification')) {
      if (n['recipientId'] !== recipientId) continue;
      const createdAt = new Date(Date.parse(String(n['createdAt'])) - ms).toISOString();
      await del(t.store, 'main', keyOf(n));
      await put(t.store, 'main', { ...n, ...K.notification(recipientId, createdAt, String(n['id'])), createdAt });
    }
    return;
  }
  await t.q(`UPDATE notifications SET created_at = created_at - ($2::text || ' milliseconds')::interval WHERE recipient_id = $1`, [recipientId, String(ms)]);
}

/** Moves a listener's "notifications seen" time `ms` earlier. */
export async function shiftSeenAt(t: TestDb, id: string, ms: number): Promise<void> {
  if (t.store) {
    const l = await (await fx()).itemAt(t.store, 'listener', (await keys()).listener(id));
    await setAttr(t, 'main', (await keys()).listener(id), 'notificationsSeenAt', new Date(Date.parse(String(l!['notificationsSeenAt'])) - ms).toISOString());
    return;
  }
  await t.q(`UPDATE listeners SET notifications_seen_at = notifications_seen_at - ($2::text || ' milliseconds')::interval WHERE id = $1`, [id, String(ms)]);
}

/** `n` follow notices from `actorId` to `recipientId`, 1 … n seconds old (the paging seed). */
export async function seedFollowNotices(t: TestDb, recipientId: string, actorId: string, n: number): Promise<void> {
  if (t.store) {
    const K = await keys();
    const { encode } = await import('../src/db/ddb/codec.ts');
    const { put } = await import('../src/db/ddb/store.ts');
    const { randomUUID } = await import('node:crypto');
    for (let g = 1; g <= n; g++) {
      const id = randomUUID();
      const createdAt = ago(g * 1000);
      await put(t.store, 'main', encode('notification', K.notification(recipientId, createdAt, id), { id, recipientId, actorId, kind: 'follow', ref: {}, createdAt }));
    }
    return;
  }
  await t.q(
    `INSERT INTO notifications (recipient_id, actor_id, kind, created_at)
     SELECT $1, $2, 'follow', now() - (g || ' seconds')::interval FROM generate_series(1, $3::int) g`,
    [recipientId, actorId, n],
  );
}

// ---- listener fields other lanes still set in SQL ----

/** Suspends a listener (lane SF's moderation writes it in SQL until it moves): the Postgres row and the listener item. */
export async function suspend(t: TestDb, id: string): Promise<void> {
  await t.q('UPDATE listeners SET suspended_at = now() WHERE id = $1', [id]);
  if (t.store) await setAttr(t, 'main', (await keys()).listener(id), 'suspendedAt', new Date().toISOString());
}
