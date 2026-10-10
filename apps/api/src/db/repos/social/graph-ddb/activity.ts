// The activity log and the Following feed on DynamoDB: activity items per actor, fanned out to each follower's inbox by the outbox.
/**
 * M26 lane SG, SG-T02 (patterns SG-10, SG-11), data-model.md §4 (sm-events) and §9 (fan-out on write).
 *
 * - `ACT#<actor>/<createdAt>#<id>` (sm-events): { id, actorId, kind, episodeId, momentMs, refId, day, hidden, createdAt }.
 *   Ids stay numbers. While the bridge is on, the Postgres row is written first and its id is used, so both stores
 *   carry the same id (other lanes' Postgres rows and these items never collide in a feed); off, `SEQ#activity`.
 * - `U#ACT#<actor>#listened#<episode>#<day>` (sm-events): the once-per-day `listened` rule (G6), carrying `hidden`.
 *   `U#ACTREF#<kind>#<refId>` → the activity key, so a deleted/removed comment or clip removes its activity.
 * - Fan-out (`sg:fanout`, outbox): one `FEED#<follower>/<createdAt>#<id>` pointer per follower (TTL 60 d), never for
 *   hidden activity (G5). Above FANOUT_MAX followers an actor is a "big actor" (`BIGACTOR`, G4 `Q#bigactors`): no
 *   fan-out, its `ACT#` partition is merged at read time (hybrid). Follow backfills the newest 50 (`sg:follow`);
 *   unfollow removes the actor's pointers (`sg:unfollow`); reads also filter by the follow set and blocks.
 * - Reads resolve each pointer to its activity item, actor and episode at read time (the SQL's JOINs): a deleted
 *   activity, actor or episode drops the row; names and titles are always current.
 * - Hybrid only: comments and clips (lane SC) and Studio replies (lane ST) still write their activity rows in Postgres
 *   SQL. Until they call `recordActivity`, the feed and the profile merge those Postgres rows (`commented`, `clipped`)
 *   in, de-duplicated by id. CUT deletes that merge.
 */
import { listenItemDue } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll, batchWriteAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { nextSeq } from '../../../ddb/seq.ts';
import { del, get, queryPage, type Item, type Key, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { enqueue, registerHandler } from '../../../../jobs/outbox.ts';
import { getListener } from '../../account/ddb/common.ts';
import type { ActivityKind, FeedRow } from '../activity.ts';
import { blockedBy, DAY_MS, episodesById, iso, listenersById, nowMs, pgRaw, raw, str, type Hybrid } from './common.ts';
import { FANOUT_MAX, followSet } from './follows.ts';

export const FEED_TTL_DAYS = 60;
export const BACKFILL = 50;
export const FRIENDS_DAYS = 7;

export type ActivityIn = { actorId: string; kind: ActivityKind; episodeId: string; momentMs?: number | null; refId?: string | null; day?: string | null; hidden?: boolean };
type Act = Required<Omit<ActivityIn, 'momentMs' | 'refId' | 'day'>> & { id: number; createdAt: string; momentMs: number | null; refId: string | null; day: string | null };

const actKey = (a: { actorId: string; createdAt: string; id: number }): Key => K.ev.activity(a.actorId, a.createdAt, a.id);

/** The activity item, its uniqueness/ref items and (when visible) the fan-out entry — one transaction. False when the day's `listened` exists. */
async function writeAct(store: Store, a: Act): Promise<boolean> {
  const t = tx(store).put('events', encode('activity', actKey(a), {
    id: a.id, actorId: a.actorId, kind: a.kind, episodeId: a.episodeId, momentMs: a.momentMs, refId: a.refId, day: a.day, hidden: a.hidden, createdAt: a.createdAt,
  }), { condition: 'attribute_not_exists(PK)' });
  const ak = actKey(a);
  if (a.day !== null) {
    t.put('events', encode('unique', K.ev.activityDedupe(a.actorId, a.kind, a.episodeId, a.day), { owner: `${ak.PK}|${ak.SK}`, hidden: a.hidden }), { condition: 'attribute_not_exists(PK)', label: 'day' });
  }
  if (a.refId) t.put('events', encode('unique', K.evSg.activityRef(a.kind, a.refId), { owner: `${ak.PK}|${ak.SK}`, actPK: ak.PK, actSK: ak.SK }));
  if (!a.hidden) enqueue(t, store, { kind: 'sg:fanout', payload: { actorId: a.actorId, actPK: ak.PK, actSK: ak.SK, id: a.id, createdAt: a.createdAt } });
  try {
    await t.commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('day')) return false;
    throw e;
  }
  return true;
}

/**
 * Lanes SC / ST call this for a new comment or clip (`commented` / `clipped`), lane LB's listened sync for `listened`
 * (through `onListened`). Returns the activity id, or undefined when the day's `listened` row already exists.
 */
export async function recordActivity(store: Store, db: Db, a: ActivityIn): Promise<number | undefined> {
  const h: Hybrid = { store, pg: db };
  const pg = raw(h);
  let id: number;
  let createdAt: string;
  if (pg) {
    const [row] = await pg.query<{ id: string | number; created_at: Date | string }>(
      `INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, day, hidden) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING id, created_at`,
      [a.actorId, a.kind, a.episodeId, a.momentMs ?? null, a.refId ?? null, a.day ?? null, a.hidden ?? false]);
    if (!row) return undefined;
    id = Number(row.id);
    createdAt = new Date(row.created_at).toISOString();
  } else {
    id = await nextSeq(store, 'activity');
    createdAt = iso(nowMs(h));
  }
  const ok = await writeAct(store, { actorId: a.actorId, kind: a.kind, episodeId: a.episodeId, momentMs: a.momentMs ?? null, refId: a.refId ?? null, day: a.day ?? null, hidden: a.hidden ?? false, id, createdAt });
  return ok ? id : undefined;
}

/** A comment or clip is gone (deleted, removed by moderation, hidden by a host): its activity goes too. */
export async function removeActivityByRef(store: Store, db: Db, kind: ActivityKind, refId: string): Promise<void> {
  const ref = await get(store, 'events', K.evSg.activityRef(kind, refId));
  if (ref) {
    await del(store, 'events', { PK: String(ref['actPK']), SK: String(ref['actSK']) });
    await del(store, 'events', K.evSg.activityRef(kind, refId));
  }
  await raw({ store, pg: db })?.query('DELETE FROM activity WHERE kind = $1 AND ref_id = $2', [kind, refId]);
}

/**
 * Lane LB's listened sync calls this for each (episode, day) it stored: the once-per-day `listened` activity (G6) and
 * "friends are listening" (SG-T03). With the bridge on, LB's Postgres body has just written the Postgres row; the item
 * copies it (same id, same `hidden`). Off, the rule runs here (threshold or finished, registered episode, `hidden` =
 * the listener's private-listening switch now — research R5).
 */
export async function onListened(store: Store, db: Db, listenerId: string, d: { episodeId: string; day: string }, before: number, after: number): Promise<void> {
  const h: Hybrid = { store, pg: db };
  const dayKey = K.ev.activityDedupe(listenerId, 'listened', d.episodeId, d.day);
  let mark = await get(store, 'events', dayKey);
  if (!mark) {
    const pg = raw(h);
    if (pg) {
      const [row] = await pg.query<{ id: string | number; hidden: boolean; created_at: Date | string }>(
        "SELECT id, hidden, created_at FROM activity WHERE actor_id = $1 AND kind = 'listened' AND episode_id = $2 AND day = $3", [listenerId, d.episodeId, d.day]);
      if (row) await writeAct(store, { actorId: listenerId, kind: 'listened', episodeId: d.episodeId, momentMs: null, refId: null, day: d.day, hidden: row.hidden, id: Number(row.id), createdAt: new Date(row.created_at).toISOString() });
    } else {
      const pos = await get(store, 'main', K.position(listenerId, d.episodeId));
      if (listenItemDue(before, after, false, pos?.['finished'] === true) && (await get(store, 'main', K.episode(d.episodeId)))) {
        const l = await getListener(h, listenerId);
        await writeAct(store, { actorId: listenerId, kind: 'listened', episodeId: d.episodeId, momentMs: null, refId: null, day: d.day, hidden: l?.['privateListening'] === true, id: await nextSeq(store, 'activity'), createdAt: iso(nowMs(h)) });
      }
    }
    mark = await get(store, 'events', dayKey);
  }
  // Friends listening: never a listen written while private (the day's activity is hidden), never while private now.
  if (mark?.['hidden'] === true) return;
  if ((await getListener(h, listenerId))?.['privateListening'] === true) return;
  const at = iso(nowMs(h));
  const t = tx(store).put('events', encode('recentListen', K.evSg.recentListen(listenerId, d.episodeId), { episodeId: d.episodeId, day: d.day, at }, { ttl: ttlAfter(nowMs(h), (FRIENDS_DAYS + 1) * DAY_MS) }));
  enqueue(t, store, { kind: 'sg:listen', payload: { actorId: listenerId, episodeId: d.episodeId, day: d.day, at } });
  await t.commit();
}

/** AC's interests fade (`playCount`): distinct episodes the listener has a `listened` activity for. */
export async function listenedEpisodeCount(h: Hybrid, listenerId: string): Promise<number> {
  const { items } = await queryAll(h.store, 'events', {
    KeyConditionExpression: 'PK = :pk', FilterExpression: '#k = :k', ProjectionExpression: '#e',
    ExpressionAttributeNames: { '#k': 'kind', '#e': 'episodeId' }, ExpressionAttributeValues: { ':pk': `ACT#${listenerId}`, ':k': 'listened' }, ConsistentRead: true,
  });
  return new Set(items.map((i) => String(i['episodeId']))).size;
}

// ---- reads ----

const pad16 = (id: string | number) => K.pad(Number(id));
const bound = (c: { createdAt: string; id: string }) => `${K.ts(c.createdAt)}#${pad16(c.id)}`;

/** Activity items → feed rows: the actor and the episode joined at read time; a missing one drops the row. */
async function toRows(store: Store, acts: readonly Item[]): Promise<FeedRow[]> {
  const [actors, eps] = await Promise.all([listenersById(store, acts.map((a) => String(a['actorId']))), episodesById(store, acts.map((a) => String(a['episodeId'])))]);
  return acts.flatMap((a) => {
    const l = actors.get(String(a['actorId']));
    const e = eps.get(String(a['episodeId']));
    if (!l || !e || a['hidden'] === true) return [];
    return [{
      id: String(a['id']), kind: a['kind'] as ActivityKind, actor_id: String(a['actorId']), actor_name: str(l['displayName']),
      episode_id: String(a['episodeId']), episode_title: String(e['title']), show_title: str(e['showTitle']), image_url: str(e['imageUrl']),
      moment_ms: a['momentMs'] === null || a['momentMs'] === undefined ? null : Number(a['momentMs']), ref_id: str(a['refId']), created_at: String(a['createdAt']),
    }];
  });
}

const newestFirst = (a: FeedRow, b: FeedRow): number =>
  a.created_at !== b.created_at ? (a.created_at < b.created_at ? 1 : -1) : Number(b.id) - Number(a.id);

/** Merge sources, one row per id, newest first. */
function merge(lists: readonly FeedRow[][]): FeedRow[] {
  const seen = new Map<string, FeedRow>();
  for (const l of lists) for (const r of l) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()].sort(newestFirst);
}

/** Up to `want` visible activity rows of one actor's partition, below the cursor. */
async function actorRows(store: Store, actorId: string, cursor: { createdAt: string; id: string } | undefined, want: number): Promise<FeedRow[]> {
  const out: FeedRow[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await queryPage(store, 'events', {
      KeyConditionExpression: cursor ? 'PK = :pk AND SK < :b' : 'PK = :pk', FilterExpression: '#h = :f',
      ExpressionAttributeNames: { '#h': 'hidden' }, ExpressionAttributeValues: { ':pk': `ACT#${actorId}`, ':f': false, ...(cursor ? { ':b': bound(cursor) } : {}) },
      ScanIndexForward: false, ConsistentRead: true, Limit: Math.max(want, 25), ...(start ? { ExclusiveStartKey: start } : {}),
    });
    out.push(...(await toRows(store, (page.Items ?? []) as Item[])));
    start = page.LastEvaluatedKey;
  } while (start && out.length < want);
  return out.slice(0, want);
}

/** Hybrid only: the `commented` / `clipped` rows lanes SC and ST still write in Postgres SQL (same JOINs as the old feed). */
async function pgRows(h: Hybrid, actorIds: readonly string[], viewerId: string | undefined, cursor: { createdAt: string; id: string } | undefined, want: number): Promise<FeedRow[]> {
  if (actorIds.length === 0) return [];
  const rows = await pgRaw(h).query<FeedRow>(
    `SELECT a.id::text AS id, a.kind, a.actor_id, l.display_name AS actor_name, a.episode_id, e.title AS episode_title, e.show_title, e.image_url, a.moment_ms, a.ref_id, a.created_at
       FROM activity a JOIN listeners l ON l.id = a.actor_id JOIN episodes e ON e.id = a.episode_id
      WHERE a.kind IN ('commented', 'clipped') AND a.hidden = false AND a.actor_id = ANY($1::uuid[])
        ${viewerId ? 'AND a.actor_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $3)' : ''}
        ${cursor ? `AND (a.created_at, a.id) < ($${viewerId ? 4 : 3}::timestamptz, $${viewerId ? 5 : 4}::bigint)` : ''}
      ORDER BY a.created_at DESC, a.id DESC LIMIT $2`,
    [[...actorIds], want, ...(viewerId ? [viewerId] : []), ...(cursor ? [cursor.createdAt, cursor.id] : [])]);
  return rows.map((r) => ({ ...r, id: String(r.id), created_at: new Date(r.created_at).toISOString() }));
}

function parseCursor(s: string): { createdAt: string; id: string } | undefined {
  const i = s.lastIndexOf(',');
  if (i < 0) return undefined;
  const createdAt = s.slice(0, i);
  const id = s.slice(i + 1);
  return Number.isNaN(Date.parse(createdAt)) || !/^\d+$/.test(id) ? undefined : { createdAt: new Date(createdAt).toISOString(), id };
}

/** The Following feed: `before` is "<createdAt ISO>,<id>" from a previous page's `next`. */
export async function feedFor(h: Hybrid, listenerId: string, before?: string, limit = 20): Promise<{ items: FeedRow[]; next?: string }> {
  const cursor = before ? parseCursor(before) : undefined;
  const want = limit + 1;
  const [follows, blocked] = await Promise.all([followSet(h, listenerId), blockedBy(h, listenerId)]);
  const actors = [...follows].filter((id) => !blocked.has(id));
  const live = new Set(actors);
  const inbox: FeedRow[] = [];
  let start: Record<string, unknown> | undefined;
  if (actors.length > 0) {
    do {
      const page = await queryPage(h.store, 'events', {
        KeyConditionExpression: cursor ? 'PK = :pk AND SK < :b' : 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `FEED#${listenerId}`, ...(cursor ? { ':b': bound(cursor) } : {}) },
        ScanIndexForward: false, ConsistentRead: true, Limit: 50, ...(start ? { ExclusiveStartKey: start } : {}),
      });
      const ptrs = ((page.Items ?? []) as Item[]).filter((p) => live.has(String(p['actorId'])));
      const acts = await batchGetAll(h.store, 'events', ptrs.map((p) => ({ PK: String(p['actPK']), SK: String(p['actSK']) })));
      inbox.push(...(await toRows(h.store, acts)));
      start = page.LastEvaluatedKey;
    } while (start && inbox.length < want);
  }
  // Big actors (none today): not fanned out — their own partition, merged here.
  const bigs = actors.length === 0 ? [] : (await queryAll(h.store, 'main', { IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': 'Q#bigactors' } }))
    .items.map((i) => String(i['PK']).slice(2)).filter((id) => live.has(id));
  const big = await Promise.all(bigs.map((id) => actorRows(h.store, id, cursor, want)));
  const legacy = await pgRows(h, actors, listenerId, cursor, want);
  const rows = merge([inbox, ...big, legacy]);
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const next = rows.length > limit && last ? `${new Date(last.created_at).toISOString()},${last.id}` : undefined;
  return { items, ...(next ? { next } : {}) };
}

/** Recent public activity by one listener, for their profile. */
export async function recentBy(h: Hybrid, actorId: string, limit = 20): Promise<FeedRow[]> {
  const mine = await actorRows(h.store, actorId, undefined, limit);
  const legacy = await pgRows(h, [actorId], undefined, undefined, limit);
  return merge([mine, legacy]).slice(0, limit);
}

// ---- outbox handlers (idempotent: a pointer Put twice is the same item) ----

const feedPtr = (followerId: string, p: { actorId: string; actPK: string; actSK: string; id: number; createdAt: string }) =>
  encode('feedInbox', K.ev.feedInbox(followerId, p.createdAt, pad16(p.id)), { actorId: p.actorId, activityId: p.id, actPK: p.actPK, actSK: p.actSK, createdAt: p.createdAt }, {
    ttl: ttlAfter(Date.parse(p.createdAt), FEED_TTL_DAYS * DAY_MS),
  });
const flItem = (followerId: string, p: { actorId: string; episodeId: string; day: string; at: string }) =>
  encode('friendsListening', K.ev.friendsListening(followerId, p.episodeId, p.actorId), { actorId: p.actorId, episodeId: p.episodeId, day: p.day, at: p.at }, {
    ttl: ttlAfter(Date.parse(p.at), FRIENDS_DAYS * DAY_MS),
  });

async function followerIds(store: Store, actorId: string): Promise<string[] | undefined> {
  if (await get(store, 'main', K.bigActor(actorId))) return undefined; // merged at read time instead
  const { items } = await queryAll(store, 'main', { KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(actorId), ':p': K.LISTENER_SK.followers }, ConsistentRead: true });
  return items.length > FANOUT_MAX ? undefined : items.map((i) => String(i['otherId']));
}

registerHandler('sg:fanout', async (store, entry) => {
  const p = entry.payload as { actorId: string; actPK: string; actSK: string; id: number; createdAt: string };
  if (!(await get(store, 'events', { PK: p.actPK, SK: p.actSK }))) return; // gone before the fan-out ran
  const ids = await followerIds(store, p.actorId);
  if (ids?.length) await batchWriteAll(store, 'events', ids.map((f) => ({ put: feedPtr(f, p) })));
});

registerHandler('sg:listen', async (store, entry) => {
  const p = entry.payload as { actorId: string; episodeId: string; day: string; at: string };
  const ids = await followerIds(store, p.actorId);
  if (ids?.length) await batchWriteAll(store, 'events', ids.map((f) => ({ put: flItem(f, p) })));
});

/** A new follow: the newest BACKFILL visible activities and the last week's listens of the followed, unless unfollowed meanwhile. */
registerHandler('sg:follow', async (store, entry) => {
  const { followerId, followedId } = entry.payload as { followerId: string; followedId: string };
  if (!(await get(store, 'main', K.follow(followerId, followedId)))) return;
  const { items: acts } = await queryAll(store, 'events', {
    KeyConditionExpression: 'PK = :pk', FilterExpression: '#h = :f', ExpressionAttributeNames: { '#h': 'hidden' },
    ExpressionAttributeValues: { ':pk': `ACT#${followedId}`, ':f': false }, ScanIndexForward: false, ConsistentRead: true,
  }, { max: BACKFILL });
  const since = new Date(store.clock.now() - FRIENDS_DAYS * DAY_MS).toISOString();
  const { items: listens } = await queryAll(store, 'events', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `LR#${followedId}` }, ConsistentRead: true });
  await batchWriteAll(store, 'events', [
    ...acts.map((a) => ({ put: feedPtr(followerId, { actorId: followedId, actPK: String(a['PK']), actSK: String(a['SK']), id: Number(a['id']), createdAt: String(a['createdAt']) }) })),
    ...listens.filter((l) => String(l['at']) > since).map((l) => ({ put: flItem(followerId, { actorId: followedId, episodeId: String(l['episodeId']), day: String(l['day']), at: String(l['at']) }) })),
  ]);
});

/** An unfollow: the followed's pointers leave the inbox and friends listening, unless followed again meanwhile. */
registerHandler('sg:unfollow', async (store, entry) => {
  const { followerId, followedId } = entry.payload as { followerId: string; followedId: string };
  if (await get(store, 'main', K.follow(followerId, followedId))) return;
  const gone: Key[] = [];
  for (const pk of [`FEED#${followerId}`, `FL#${followerId}`]) {
    const { items } = await queryAll(store, 'events', {
      KeyConditionExpression: 'PK = :pk', FilterExpression: '#a = :a', ExpressionAttributeNames: { '#a': 'actorId' }, ExpressionAttributeValues: { ':pk': pk, ':a': followedId }, ConsistentRead: true,
    });
    gone.push(...items.map((i) => ({ PK: String(i['PK']), SK: String(i['SK']) })));
  }
  await batchWriteAll(store, 'events', gone.map((k) => ({ delete: k })));
});
