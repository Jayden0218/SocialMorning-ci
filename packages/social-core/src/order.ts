import type { CommentOrder } from './types';

/**
 * FR-023: the orders for the top-level list.
 *  - newest:   by createdAt, newest first.
 *  - liked:    M12 FR-026 — by like count, most first; ties newest first (no count = 0).
 *  - byMoment: timestamped comments in episode order (offset ascending, ties by
 *              createdAt ascending), then the moment-less ones newest first.
 * Stable, and never mutates its input.
 */
export function orderComments<T extends { offsetMs: number | null; createdAt: number; likeCount?: number }>(
  comments: readonly T[],
  order: CommentOrder,
): T[] {
  const indexed = comments.map((c, i) => ({ c, i }));
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
