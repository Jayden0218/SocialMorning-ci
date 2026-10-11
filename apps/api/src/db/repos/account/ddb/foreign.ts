// What the account lane reads from other lanes (LB catalog, PD paid, SG graph, SF safety, SC content) — through their DynamoDB items.
/**
 * M26 lane AC; the LB and SC reads switched from SQL to those lanes' items by lane LE (gap 4: with the bridge off, no
 * DynamoDB body reads Postgres). Each function keeps its name, parameters and row shape, so push.ts and account.ts are
 * unchanged; `pg` is the app's Db (it carries the Store — `attachedOf(pg).store`). The shadow writes at the end still
 * run only while the bridge is on (their callers check `bridgeOn`).
 */
import type { Db } from '../../../db.ts';
import { plusMembersDue } from '../purchases.ts';
import { DIGEST_MAX } from '../digest.ts';
import { isBlockedBy } from '../../safety/blocks.ts';
import { isAdminRows } from '../../admin/admin-access.ts';
import { attachedOf } from '../../../backend-ddb.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Item } from '../../../ddb/store.ts';
import { statusFollowerIds } from '../../social/graph-ddb/follows.ts';
import { isMuted, isThreadMuted } from '../../social/graph-ddb/mutes.ts';
import { listenedEpisodeCount as graphListenedEpisodeCount } from '../../social/graph-ddb/activity.ts';

/** Lane SG has moved: its items are read through its repo (graph-ddb), with the Store this Db carries. */
const sg = (pg: Db) => ({ store: attachedOf(pg).store, pg });
const storeOf = (pg: Db) => attachedOf(pg).store;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** LB: listeners with a live subscription to the feed — lane LB's G2 `SHSUBS#<feedKey>` (live subscriptions only). */
export async function liveSubscribers(pg: Db, feedUrl: string): Promise<string[]> {
  const { items } = await queryAll(storeOf(pg), 'main', { IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p', ExpressionAttributeValues: { ':p': `SHSUBS#${K.feedKey(feedUrl)}` } });
  return [...new Set(items.map((i) => String(i['G2SK']).slice(String(i['G2SK']).lastIndexOf('#') + 1)))];
}

/** LB: a listener's live subscriptions, newest first, each with its newest show title (the show META's `newestTitle`). */
export async function liveSubscriptionsWithTitles(pg: Db, listenerId: string): Promise<{ feed_url: string; title: string | null }[]> {
  const store = storeOf(pg);
  const { subscriptionItems, subscriptionRow } = await import('../../library/ddb/subscriptions.ts');
  const live = (await subscriptionItems(store, listenerId)).map(subscriptionRow).filter((r) => r.deleted_at === null)
    .sort((a, b) => cmp(String(b.created_at), String(a.created_at)));
  const metas = new Map((await batchGetAll(store, 'main', live.map((r) => K.show(r.feed_url)))).map((m) => [String(m['feedUrl']), m]));
  return live.map((r) => ({ feed_url: r.feed_url, title: (metas.get(r.feed_url)?.['newestTitle'] as string | undefined) ?? null }));
}

/**
 * PD (moved, lane PD): everyone with live PLUS (any source), once each — now lane PD's repo (`plusMembersDue`): on
 * DynamoDB only the `Q#plus#<tz>` queues of zones where it is Monday noon at `now` are read (AC-T07).
 */
export async function plusMembers(pg: Db, now: Date): Promise<string[]> {
  return plusMembersDue(pg, now);
}

/**
 * LB/ST: the digest's episodes for one listener's week (the SQL of digest.ts `pick`): episodes of the listener's live
 * subscriptions published in [from, to) (lane LB's G2 `SHEPS#<feedKey>`), not started (no position item), not hidden
 * by a host (lane ST's hidden set), newest first then id, at most DIGEST_MAX.
 */
export async function digestPick(pg: Db, listenerId: string, from: Date, to: Date): Promise<string[]> {
  const store = storeOf(pg);
  const [{ subscriptionItems, subscriptionRow }, { hiddenEpisodeIds }] = await Promise.all([import('../../library/ddb/subscriptions.ts'), import('../../studio/ddb/page.ts')]);
  const feeds = [...new Set((await subscriptionItems(store, listenerId)).map(subscriptionRow).filter((r) => r.deleted_at === null).map((r) => r.feed_url))];
  const lo = K.ts(from);
  const hi = K.ts(to);
  const found: { id: string; at: string }[] = [];
  for (const f of feeds) {
    const { items } = await queryAll(store, 'main', {
      IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p AND G2SK BETWEEN :lo AND :hi',
      ExpressionAttributeValues: { ':p': `SHEPS#${K.feedKey(f)}`, ':lo': lo, ':hi': `${hi}#` },
    });
    for (const i of items) {
      const sk = String(i['G2SK']);
      const cut = sk.indexOf('#', 20);
      const at = sk.slice(0, cut);
      if (at >= lo && at < hi) found.push({ id: sk.slice(cut + 1), at });
    }
  }
  if (found.length === 0) return [];
  const [hidden, positions] = await Promise.all([
    hiddenEpisodeIds(store, pg),
    batchGetAll(store, 'main', found.map((e) => K.position(listenerId, e.id))),
  ]);
  const started = new Set(positions.map((p) => String(p['SK']).slice('POS#'.length)));
  return found.filter((e) => !started.has(e.id) && !hidden.has(e.id))
    .sort((a, b) => cmp(b.at, a.at) || cmp(a.id, b.id)).slice(0, DIGEST_MAX).map((e) => e.id);
}

export type EpisodeCardRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; enclosure_url: string; image_url: string | null; duration_ms: number | null; published_at: Date | string | null };

/** LB: episode cards by id (lane LB's episode items). */
export async function episodesByIds(pg: Db, ids: readonly string[]): Promise<EpisodeCardRow[]> {
  if (ids.length === 0) return [];
  const { episodeRow } = await import('../../library/ddb/episodes.ts');
  const items = await batchGetAll(storeOf(pg), 'main', [...new Set(ids)].map((id) => K.episode(id)));
  return items.map((it: Item) => episodeRow(it));
}

/** SF/SG/SC: what a social push must know about recipient and actor (blocks both ways, mute, muted thread, the comment). Blocks are lane SF's, mutes lane SG's, the comment lane SC's item. */
export async function pushRelations(pg: Db, recipientId: string, actorId: string, threadKind: string, threadKey: string, commentId: string): Promise<{ blocked: boolean; muted: boolean; thread_muted: boolean; likes_off: boolean; excerpt: string | null } | undefined> {
  const { commentItemById } = await import('../../social/ddb/sc-common.ts');
  const c = /^[0-9a-f-]{36}$/i.test(commentId) ? await commentItemById(storeOf(pg), commentId) : undefined;
  // The SQL's `left(body, 120)` counts characters, not UTF-16 units.
  const rel = { likes_off: c?.['likeNoticesOff'] === true, excerpt: typeof c?.['body'] === 'string' ? [...String(c['body'])].slice(0, 120).join('') : null };
  const blocked = (await isBlockedBy(pg, recipientId, actorId)) || (await isBlockedBy(pg, actorId, recipientId));
  const muted = await isMuted(sg(pg), recipientId, actorId);
  const threadMuted = threadKind ? await isThreadMuted(sg(pg), recipientId, threadKind, threadKey) : false;
  return { blocked, ...rel, muted, thread_muted: threadMuted };
}

/** SG (moved): followers of an author who neither blocked nor were blocked by them, nor muted them. */
export async function statusFollowers(pg: Db, authorId: string): Promise<string[]> {
  return statusFollowerIds(sg(pg), authorId);
}

/** SG (moved): distinct episodes the listener listened to (the For You interests fade). */
export async function listenedEpisodeCount(pg: Db, listenerId: string): Promise<number> {
  return graphListenedEpisodeCount(sg(pg), listenerId);
}

/** SF (moved): the dashboard counts app use from the DynamoDB `DA#<day>` markers this lane already writes — nothing more to write. */
export async function recordDailyActive(_pg: Db, _day: string, _listenerId: string): Promise<void> {}

/** SF (moved): whether a listener is an admin — lane SF's `CFG#admins` item, through its repo. */
export async function isAdminPg(pg: Db, listenerId: string): Promise<boolean> {
  const [r] = await isAdminRows(pg, listenerId);
  return Boolean(r?.ok);
}

/** The data-export sections other lanes own (data-export.ts SECTIONS minus `queue` and `devices`, which are this lane's). */
export async function exportSection(pg: Db, sql: string, listenerId: string): Promise<Record<string, unknown>[]> {
  return pg.query<Record<string, unknown>>(sql, [listenerId]);
}

// ---- the shadow writes on the Postgres `listeners` row (common.ts explains why) ----

export async function shadowInsertListener(pg: Db, l: { id: string; email: string; passwordHash: string; displayName: string; createdAt: string }): Promise<void> {
  await pg.query(
    'INSERT INTO listeners (id, email, password_hash, display_name, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
    [l.id, l.email, l.passwordHash, l.displayName, l.createdAt],
  );
}

/** One shadow column update; `col` is one of a fixed list (never from input). */
export async function shadowListener(pg: Db, id: string, col: 'hidden_at' | 'email', value: string | null): Promise<void> {
  const sql = col === 'hidden_at' ? 'UPDATE listeners SET hidden_at = $2 WHERE id = $1' : 'UPDATE listeners SET email = $2 WHERE id = $1';
  await pg.query(sql, [id, value]);
}
