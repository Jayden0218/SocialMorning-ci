// Shared pieces of the social-graph lane's DynamoDB code: the handle, time helpers, listener/episode/show item reads, reads across lanes.
/**
 * Every function in this folder takes a `Ctx` ({ store, db }) like lane AC's (account/ddb/common.ts): `db` is the
 * handle that carries the Store, so calling another lane's repo function with it runs that lane's DynamoDB body.
 * index.ts adapts the bodies to the switch's `(store, db, ...args)`.
 */
import { batchGetAll } from '../../../ddb/batch.ts';
import * as K from '../../../ddb/keys.ts';
import type { Item, Store } from '../../../ddb/store.ts';
import type { Ctx } from '../../account/ddb/common.ts';

export type { Ctx };

export const nowMs = (h: Ctx): number => h.store.clock.now();
export const iso = (ms: number): string => new Date(ms).toISOString();
export const DAY_MS = 86_400_000;

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
/** `left(s, n)`: the first n characters (code points, not UTF-16 units). */
export const left = (s: string, n: number): string => [...s].slice(0, n).join('');

// ---- reads of other lanes' items: blocks and hidden feeds (safety/ddb/), comments (social/ddb/comments.ts) ----

/** SF: the listeners `viewerId` blocked. */
export async function blockedBy(h: Ctx, viewerId: string): Promise<Set<string>> {
  return (await import('../../safety/ddb/blocks.ts')).blockedIdsFor(h.store, h.db, viewerId);
}

/** SF: everyone on the other side of a block with `id`, either direction. */
export async function blockedEitherWay(h: Ctx, id: string): Promise<Set<string>> {
  return (await import('../../safety/ddb/blocks.ts')).blockedEitherWay(h.store, id);
}

/** SF: has `a` blocked `b`? */
export async function hasBlocked(h: Ctx, a: string, b: string): Promise<boolean> {
  return (await import('../../safety/ddb/blocks.ts')).isBlockedBy(h.store, h.db, a, b);
}

/** SF: feeds the owner hid (the admin's hides, as the `hidden_feeds` table held — not the publishers' marks). */
export async function hiddenFeeds(h: Ctx, urls?: readonly string[]): Promise<Set<string>> {
  const m = await import('../../safety/ddb/moderation.ts');
  return urls ? m.adminHiddenAmong(h.store, urls) : m.adminHiddenAll(h.store);
}

export type CommentBits = { id: string; author_id: string | null; body: string | null; like_notices_off: boolean; deleted_at: unknown; removed_at: unknown; host_hidden_at: unknown };

/** SC: the comments with these ids (author, body, visibility, the like-notices switch). */
export async function commentsById(h: Ctx, ids: readonly string[]): Promise<Map<string, CommentBits>> {
  if (ids.length === 0) return new Map();
  const { commentBits } = await import('../ddb/comments.ts');
  return commentBits(h.store, ids);
}
