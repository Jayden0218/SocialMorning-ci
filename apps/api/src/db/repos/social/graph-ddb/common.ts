// Shared pieces of the social-graph lane's DynamoDB code: the hybrid handle, the bridge, foreign reads of lanes still on Postgres.
/**
 * M26 lane SG. Every function in this folder takes a `Hybrid` ({ store, pg }) like lane AC's (account/ddb/common.ts):
 * `pg` is the app's Db WITH the Store attached, so calling another lane's dual repo function with it runs that
 * lane's DynamoDB body once it has moved. index.ts adapts the bodies to the switch's `(store, db, ...args)`.
 *
 * - The bridge (`raw(h)`): while lanes that read follows / activity / mutes in SQL are still on Postgres
 *   (SC chat/likes/voice posts, DV discover/For You, ST Studio numbers, SF moderation), each DynamoDB write of those
 *   tables also writes the Postgres row. Notifications, system notices, live listeners and playlists have no
 *   Postgres reader left, so they are not bridged.
 * - Foreign reads (`foreign*` below): rows of lanes NOT moved yet (SF blocks, SC comments, ST claims/overrides/
 *   announcements/hidden episodes) are read with the same SQL the Postgres version used, on the plain Postgres
 *   handle. Rows of lanes ALREADY moved (AC listeners, LB episodes/shows/subscriptions) are read through their
 *   repo or item helpers, never by SQL. CUT deletes the foreign functions and the bridge.
 */
import type { Db } from '../../../db.ts';
import { attachedOf } from '../../../backend-ddb.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import * as K from '../../../ddb/keys.ts';
import type { Item, Store } from '../../../ddb/store.ts';
import type { Hybrid } from '../../account/ddb/common.ts';

export type { Hybrid };

export const nowMs = (h: Hybrid): number => h.store.clock.now();
export const iso = (ms: number): string => new Date(ms).toISOString();
export const DAY_MS = 86_400_000;

/** The plain Postgres handle while the bridge is on (writes of tables other lanes still read), else undefined. */
export function raw(h: Hybrid): Db | undefined {
  const a = attachedOf(h.pg);
  return a.bridge ? a.raw : undefined;
}

/** The plain Postgres handle, for foreign reads of lanes not moved yet. */
export const pgRaw = (h: Hybrid): Db => attachedOf(h.pg).raw;

/** Listener items by id (lane AC's items; strong BatchGet), keyed by id. */
export async function listenersById(store: Store, ids: Iterable<string>): Promise<Map<string, Item>> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return new Map();
  const items = await batchGetAll(store, 'main', uniq.map((id) => K.listener(id)));
  return new Map(items.map((i) => [String(i['id']), i]));
}

/** Episode items by id (lane LB's items), keyed by id. */
export async function episodesById(store: Store, ids: Iterable<string>): Promise<Map<string, Item>> {
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return new Map();
  const items = await batchGetAll(store, 'main', uniq.map((id) => K.episode(id)));
  return new Map(items.map((i) => [String(i['id']), i]));
}

/** Show META items by feed URL (lane LB's items: newest title and cover, data-model.md §16), keyed by feed URL. */
export async function showsByUrl(store: Store, urls: Iterable<string>): Promise<Map<string, Item>> {
  const uniq = [...new Set(urls)];
  if (uniq.length === 0) return new Map();
  const items = await batchGetAll(store, 'main', uniq.map((u) => K.show(u)));
  return new Map(items.map((i) => [String(i['feedUrl']), i]));
}

export const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
/** Postgres `left(s, n)`: the first n characters (code points, not UTF-16 units). */
export const left = (s: string, n: number): string => [...s].slice(0, n).join('');

// ---- foreign reads: lanes still on Postgres (SF blocks, SC comments, ST shows) ----

/** SF: the listeners `viewerId` blocked. */
export async function blockedBy(h: Hybrid, viewerId: string): Promise<Set<string>> {
  const rows = await pgRaw(h).query<{ blocked_id: string }>('SELECT blocked_id FROM blocks WHERE blocker_id = $1', [viewerId]);
  return new Set(rows.map((r) => r.blocked_id));
}

/** SF: everyone on the other side of a block with `id`, either direction. */
export async function blockedEitherWay(h: Hybrid, id: string): Promise<Set<string>> {
  const rows = await pgRaw(h).query<{ blocker_id: string; blocked_id: string }>('SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = $1 OR blocked_id = $1', [id]);
  return new Set(rows.map((r) => (r.blocker_id === id ? r.blocked_id : r.blocker_id)));
}

/** SF: has `a` blocked `b`? */
export async function hasBlocked(h: Hybrid, a: string, b: string): Promise<boolean> {
  return (await pgRaw(h).query('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [a, b])).length > 0;
}

/** SF: feeds the owner hid. */
export async function hiddenFeeds(h: Hybrid, urls?: readonly string[]): Promise<Set<string>> {
  const rows = urls
    ? await pgRaw(h).query<{ feed_url: string }>('SELECT feed_url FROM hidden_feeds WHERE feed_url = ANY($1::text[])', [[...urls]])
    : await pgRaw(h).query<{ feed_url: string }>('SELECT feed_url FROM hidden_feeds');
  return new Set(rows.map((r) => r.feed_url));
}

export type CommentBits = { id: string; author_id: string | null; body: string | null; like_notices_off: boolean; deleted_at: unknown; removed_at: unknown; host_hidden_at: unknown };

/** SC: the comments with these ids (author, body, visibility, the like-notices switch). */
export async function commentsById(h: Hybrid, ids: readonly string[]): Promise<Map<string, CommentBits>> {
  if (ids.length === 0) return new Map();
  // Lane SC moved: its repo reads the comment items (social/ddb/comments.ts).
  const { commentBits } = await import('../ddb/comments.ts');
  return commentBits(h.store, ids);
}
