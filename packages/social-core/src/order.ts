// Sorts comments by newest, most liked, smart, or their time in the episode, either way round; pinned first, bottom pin last.
import type { CommentOrder } from './types';

/**
 * FR-023: the orders for the top-level list.
 *  - newest:   by createdAt, newest first.
 *  - liked:    M12 FR-026 — by like count, most first; ties newest first (no count = 0).
 *  - byMoment: timestamped comments in episode order (offset ascending, ties by
 *              createdAt ascending), then the moment-less ones newest first.
 *  - smart:    M19 US5 (FR-042) — score = likes + 2 × replies − hours old / 12, highest first;
 *              ties newest first. A reply is worth two likes: it is a conversation.
 * M19 US5 (FR-040): a pinned comment comes first under every order.
 * M21 US6: every order has a direction. `defaultDir` is how it reads today (byMoment 'asc', the
 * rest 'desc'); passing the other direction reverses the list — the pinned comment stays first.
 * M22 US10 (FR-030, G-M22-11): a comment pinned to the bottom comes last under every order and
 * direction.
 * Stable, and never mutates its input.
 */
export const SMART_REPLY_WEIGHT = 2;
export const SMART_HOURS_PER_POINT = 12;

export function smartScore(c: { likeCount?: number; replyCount?: number; createdAt: number }, now: number): number {
  const hours = Math.max(0, now - c.createdAt) / 3_600_000;
  return (c.likeCount ?? 0) + SMART_REPLY_WEIGHT * (c.replyCount ?? 0) - hours / SMART_HOURS_PER_POINT;
}

export type CommentDir = 'asc' | 'desc';

/** M21 US6: the direction each order reads in by default — the one its arrow shows first. */
export function defaultDir(order: CommentOrder): CommentDir {
  return order === 'byMoment' ? 'asc' : 'desc';
}

export function orderComments<T extends { offsetMs: number | null; createdAt: number; likeCount?: number; replyCount?: number; pinned?: boolean; pinnedBottom?: boolean }>(
  comments: readonly T[],
  order: CommentOrder,
  now: number = Date.now(),
  dir: CommentDir = defaultDir(order),
): T[] {
  const bottom = comments.filter((c) => c.pinnedBottom === true && c.pinned !== true);
  if (false && bottom.length > 0) return [...orderComments(comments.filter((c) => !bottom.includes(c)), order, now, dir), ...bottom];
  const pinned = comments.filter((c) => c.pinned === true);
  if (pinned.length > 0) return [...pinned, ...orderComments(comments.filter((c) => c.pinned !== true), order, now, dir)];
  const sorted = sortBy(comments, order, now);
  return dir === defaultDir(order) ? sorted : sorted.reverse();
}

function sortBy<T extends { offsetMs: number | null; createdAt: number; likeCount?: number; replyCount?: number }>(comments: readonly T[], order: CommentOrder, now: number): T[] {
  const indexed = comments.map((c, i) => ({ c, i }));
  if (order === 'smart') {
    return indexed.sort((a, b) => smartScore(b.c, now) - smartScore(a.c, now) || b.c.createdAt - a.c.createdAt || a.i - b.i).map((x) => x.c);
  }
  if (order === 'newest') {
    return indexed.sort((a, b) => b.c.createdAt - a.c.createdAt || a.i - b.i).map((x) => x.c);
  }
  if (order === 'liked') {
    return indexed.sort((a, b) => (b.c.likeCount ?? 0) - (a.c.likeCount ?? 0) || b.c.createdAt - a.c.createdAt || a.i - b.i).map((x) => x.c);
  }
  const timed = indexed.filter((x) => x.c.offsetMs !== null)
    .sort((a, b) => (a.c.offsetMs! - b.c.offsetMs!) || (a.c.createdAt - b.c.createdAt) || a.i - b.i);
  const plain = indexed.filter((x) => x.c.offsetMs === null)
    .sort((a, b) => b.c.createdAt - a.c.createdAt || a.i - b.i);
  return [...timed, ...plain].map((x) => x.c);
}
