import { applyBlocks, hiddenKey } from '@socialmorning/social-core';
import type { Db } from '../db.ts';
import { ApiError } from '../../errors.ts';
import { blockedIdsFor } from './blocks.ts';
import { hiddenFor } from './reports.ts';

export type CommentRow = {
  id: string;
  episode_id: string;
  author_id: string | null;
  display_name: string | null;
  parent_id: string | null;
  body: string | null;
  offset_ms: number | null;
  created_at: Date | string;
  deleted_at: Date | string | null;
  removed_at: Date | string | null;
};

export type PublicComment = {
  id: string;
  authorId: string | null;
  displayName: string | null;
  body: string | null;
  offsetMs: number | null;
  parentId: string | null;
  createdAt: string;
  deleted: boolean;
  /** M6: taken down by moderation — a placeholder for everyone; the author sees why. */
  removed?: boolean;
  /** M6: a reply by a listener the viewer blocked — a placeholder so the thread keeps its shape (G2). */
  blocked?: boolean;
  /** M6 (FR-002): the VIEWER reported this; it reads "You reported this" for them and nobody else. */
  reported?: boolean;
  mine?: boolean;
  replies?: PublicComment[];
};

const SELECT = `SELECT c.id, c.episode_id, c.author_id, l.display_name, c.parent_id, c.body, c.offset_ms, c.created_at, c.deleted_at, c.removed_at
                FROM comments c LEFT JOIN listeners l ON l.id = c.author_id`;

export function toPublic(r: CommentRow, viewerId?: string): PublicComment {
  const removed = r.removed_at !== null;
  const deleted = r.deleted_at !== null || removed;
  return {
    id: r.id,
    authorId: deleted ? null : r.author_id,
    displayName: deleted ? null : r.display_name,
    body: deleted ? null : r.body,
    offsetMs: deleted ? null : r.offset_ms,
    parentId: r.parent_id,
    createdAt: new Date(r.created_at).toISOString(),
    deleted,
    ...(removed ? { removed: true } : {}),
    ...((r as CommentRow & { blocked?: true }).blocked ? { blocked: true } : {}),
    ...((r as CommentRow & { reported?: true }).reported ? { reported: true } : {}),
    ...(viewerId !== undefined ? { mine: (!deleted || removed) && r.author_id === viewerId } : {}),
  };
}

export async function createComment(
  db: Db,
  c: { episodeId: string; authorId: string; body: string; offsetMs?: number; parentId?: string },
): Promise<CommentRow> {
  if (c.parentId) {
    const parent = (await db.query<{ episode_id: string; parent_id: string | null }>(
      'SELECT episode_id, parent_id FROM comments WHERE id = $1', [c.parentId],
    ))[0];
    if (!parent || parent.episode_id !== c.episodeId) throw new ApiError('not_found', 'That comment is not on this episode.');
    if (parent.parent_id !== null) throw new ApiError('reply_depth', 'You can reply to a comment, not to a reply.');
  }
  const [row] = await db.query<{ id: string }>(
    'INSERT INTO comments (episode_id, author_id, parent_id, body, offset_ms) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [c.episodeId, c.authorId, c.parentId ?? null, c.body, c.offsetMs ?? null],
  );
  // M4 (research R4): a top-level comment is a feed item; replies are not.
  if (!c.parentId) {
    await db.query(
      `INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, hidden) VALUES ($1, 'commented', $2, $3, $4, false)`,
      [c.authorId, c.episodeId, c.offsetMs ?? null, row!.id],
    );
  }
  return (await db.query<CommentRow>(`${SELECT} WHERE c.id = $1`, [row!.id]))[0]!;
}

export async function getComment(db: Db, id: string): Promise<CommentRow | undefined> {
  return (await db.query<CommentRow>(`${SELECT} WHERE c.id = $1`, [id]))[0];
}

/**
 * FR-010: a comment with replies becomes a placeholder (body/author/moment NULL,
 * deleted_at set) so the replies keep their context; one without is removed.
 * Returns whether a placeholder was left, and the episode (for the heat rebuild).
 */
export async function deleteComment(db: Db, id: string): Promise<{ placeholder: boolean; episodeId: string }> {
  const row = (await db.query<{ episode_id: string; replies: number }>(
    'SELECT episode_id, (SELECT count(*)::int FROM comments r WHERE r.parent_id = c.id) AS replies FROM comments c WHERE c.id = $1',
    [id],
  ))[0];
  if (!row) throw new ApiError('not_found', 'No such comment.');
  await db.query(`DELETE FROM activity WHERE kind = 'commented' AND ref_id = $1`, [id]); // M4: gone from feeds either way
  if (Number(row.replies) > 0) {
    await db.query(
      'UPDATE comments SET body = NULL, author_id = NULL, offset_ms = NULL, deleted_at = now() WHERE id = $1',
      [id],
    );
    return { placeholder: true, episodeId: row.episode_id };
  }
  await db.query('DELETE FROM comments WHERE id = $1', [id]);
  return { placeholder: false, episodeId: row.episode_id };
}

/** Top-level newest first, each with its replies oldest first (contracts/api.md). */
export async function listComments(db: Db, episodeId: string, viewerId?: string): Promise<PublicComment[]> {
  const all = await db.query<CommentRow>(`${SELECT} WHERE c.episode_id = $1 ORDER BY c.created_at ASC`, [episodeId]);
  // M6 (R1, G1): a signed-in viewer never sees a blocked listener's comments or what they reported.
  const rows = viewerId === undefined ? all : await filterForViewer(db, all, viewerId);
  const byId = new Map<string, PublicComment>();
  const top: PublicComment[] = [];
  for (const r of rows) {
    const c = toPublic(r, viewerId);
    byId.set(c.id, c);
    if (c.parentId === null) top.push({ ...c, replies: [] });
  }
  const topById = new Map(top.map((c) => [c.id, c]));
  for (const r of rows) {
    if (r.parent_id === null) continue;
    topById.get(r.parent_id)?.replies!.push(byId.get(r.id)!);
  }
  return top.reverse();
}

/** Blocked authors and reported ids out; a blocked reply under a kept parent stays as a placeholder row. */
async function filterForViewer(db: Db, rows: CommentRow[], viewerId: string): Promise<CommentRow[]> {
  const [blocked, hidden] = await Promise.all([blockedIdsFor(db, viewerId), hiddenFor(db, viewerId)]);
  if (blocked.size === 0 && hidden.keys.size === 0) return rows;
  const named = rows.map((r) => ({ id: r.id, authorId: r.author_id, parentId: r.parent_id, key: hiddenKey('comment', r.id), row: r }));
  return applyBlocks(named, blocked, hidden.keys).map((i) => {
    if (!('placeholder' in i)) return i.row;
    const original = rows.find((r) => r.id === i.id)!;
    const bare = { ...original, author_id: null, display_name: null, body: null, offset_ms: null, deleted_at: new Date(0), removed_at: null };
    return (i.placeholder === 'reported'
      ? { ...bare, reported: true }
      : { ...bare, blocked: true }) as CommentRow & { blocked?: true; reported?: true };
  });
}
