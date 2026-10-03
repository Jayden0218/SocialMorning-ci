// Comment likes: one per listener, never your own, hidden comments not likeable.
/**
 * M12 FR-023 — comment likes. One per listener per comment (the primary key makes both
 * directions idempotent). Guard G-C2: you cannot like your own comment — refused here with
 * `own_comment`, before any insert. A comment nobody can see (deleted, removed, hidden by the
 * host) or one across a block in either direction is `not_found`: a like must not reveal it.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

export type LikeState = { likeCount: number; likedByMe: boolean };

/** The first letter or digit of a display name, upper-cased; null when there is none. */
export function initialsOf(name: string | null | undefined): string | null {
  const m = /[\p{L}\p{N}]/u.exec(name ?? '');
  return m ? m[0].toLocaleUpperCase() : null;
}

async function likeable(db: Db, commentId: string, listenerId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(commentId)) throw new ApiError('not_found', 'No such comment.');
  const [row] = await db.query<{ author_id: string | null; deleted_at: string | null; removed_at: string | null; host_hidden_at: string | null }>(
    'SELECT author_id, deleted_at, removed_at, host_hidden_at FROM comments WHERE id = $1', [commentId]);
  if (!row || row.author_id === null || row.deleted_at !== null || row.removed_at !== null || row.host_hidden_at !== null) {
    throw new ApiError('not_found', 'No such comment.');
  }
  // G-C2: the author check. It comes before the block check so the answer names the reason.
  if (row.author_id === listenerId) throw new ApiError('own_comment', "You can't like your own comment.");
  const wall = await db.query(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [row.author_id, listenerId]);
  if (wall.length > 0) throw new ApiError('not_found', 'No such comment.');
}

async function countFor(db: Db, commentId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM comment_likes WHERE comment_id = $1', [commentId]);
  return Number(r?.n ?? 0);
}

export async function like(db: Db, commentId: string, listenerId: string): Promise<LikeState> {
  await likeable(db, commentId, listenerId);
  await db.query('INSERT INTO comment_likes (comment_id, listener_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentId, listenerId]);
  return { likeCount: await countFor(db, commentId), likedByMe: true };
}

/** Idempotent: un-liking something you never liked is fine. Only a comment that does not exist at all is 404. */
export async function unlike(db: Db, commentId: string, listenerId: string): Promise<LikeState> {
  if (!/^[0-9a-f-]{36}$/i.test(commentId)) throw new ApiError('not_found', 'No such comment.');
  const exists = await db.query('SELECT 1 FROM comments WHERE id = $1', [commentId]);
  if (exists.length === 0) throw new ApiError('not_found', 'No such comment.');
  await db.query('DELETE FROM comment_likes WHERE comment_id = $1 AND listener_id = $2', [commentId, listenerId]);
  return { likeCount: await countFor(db, commentId), likedByMe: false };
}

/** Every comment on the episode that has a like: its count, and whether the viewer is one of them. */
export async function likesOnEpisode(db: Db, episodeId: string, viewerId?: string): Promise<Map<string, LikeState>> {
  const rows = await db.query<{ comment_id: string; n: number; mine: boolean }>(
    `SELECT cl.comment_id, count(*)::int AS n, bool_or(cl.listener_id = $2::uuid) AS mine
     FROM comment_likes cl JOIN comments c ON c.id = cl.comment_id
     WHERE c.episode_id = $1 GROUP BY cl.comment_id`,
    [episodeId, viewerId ?? null],
  );
  return new Map(rows.map((r) => [r.comment_id, { likeCount: Number(r.n), likedByMe: r.mine === true }]));
}

/** Part of the social poll's ETag: a like added or taken away changes it (count + newest). */
export async function likesStamp(db: Db, episodeId: string): Promise<string> {
  const [r] = await db.query<{ v: string }>(
    `SELECT count(*)::text || '/' || coalesce(max(cl.created_at)::text, '-') AS v
     FROM comment_likes cl JOIN comments c ON c.id = cl.comment_id WHERE c.episode_id = $1`, [episodeId]);
  return r?.v ?? '-';
}
