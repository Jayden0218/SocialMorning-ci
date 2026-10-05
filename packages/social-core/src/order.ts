// Sorts comments by newest, most liked, smart, or their time in the episode; pinned first.
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
 * Stable, and never mutates its input.
 */
export const SMART_REPLY_WEIGHT = 2;
export const SMART_HOURS_PER_POINT = 12;

export function smartScore(c: { likeCount?: number; replyCount?: number; createdAt: number }, now: number): number {
  const hours = Math.max(0, now - c.createdAt) / 3_600_000;
  return (c.likeCount ?? 0) + SMART_REPLY_WEIGHT * (c.replyCount ?? 0) - hours / SMART_HOURS_PER_POINT;
}

export function orderComments<T extends { offsetMs: number | null; createdAt: number; likeCount?: number; replyCount?: number; pinned?: boolean }>(
  comments: readonly T[],
  order: CommentOrder,
  now: number = Date.now(),
): T[] {
  const pinned = comments.filter((c) => c.pinned === true);
  if (pinned.length > 0) return [...pinned, ...orderComments(comments.filter((c) => c.pinned !== true), order, now)];
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
