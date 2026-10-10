// Comments: create, list as threads, delete, and shape them for each viewer.
import { hostsOfEpisode } from '../studio/creator.ts';
import { applyBlocks, hiddenKey } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { blockedIdsFor } from '../safety/blocks.ts';
import { hiddenFor } from '../safety/reports.ts';
import { initialsOf, likesOnEpisode, type LikeState } from './comment-likes.ts';
import { dual } from '../../backend.ts';
import { mutedIdsFor } from './mutes.ts';
import { notifyForComment } from './notifications.ts';
import { heldForAuthor } from '../studio/comment-policy.ts';

export type CommentRow = {
  id: string;
  episode_id: string;
  author_id: string | null;
  display_name: string | null;
  /** M19 US1: the author's photo, when set. */
  avatar_url?: string | null;
  parent_id: string | null;
  body: string | null;
  offset_ms: number | null;
  created_at: Date | string;
  deleted_at: Date | string | null;
  removed_at: Date | string | null;
  /** M11: hidden by the show's host in the Studio — gone for everyone but its author. */
  host_hidden_at?: Date | string | null;
  /** M19 US5/US6: pinned by a host; a voice recording instead of (or with) text. */
  pinned_at?: Date | string | null;
  /** M22 US10: pinned to the bottom by a host — last under every order. */
  pinned_bottom_at?: Date | string | null;
  voice_url?: string | null;
  voice_ms?: number | null;
  /** M20 US3: the text of a voice comment, as its author checked it. */
  transcript?: string | null;
  /** M20 US9: one image (constitution v3.2.0), in the R2 store. */
  image_url?: string | null;
  image_path?: string | null;
  image_w?: number | null;
  image_h?: number | null;
  /** M21 US6: the region the server saw at post time (two letters), and the author's badge inputs. */
  country?: string | null;
  author_listened_ms?: number | string | null;
  author_hide_badge?: boolean | null;
  /** M22 US11: the author asked to delete their account and is hidden during the 15-day wait. */
  author_hidden_at?: Date | string | null;
};

/** M21 US6: the listening badge — 100 h, 500 h or 1000 h of total listening; none below 100 h. */
export type Badge = 100 | 500 | 1000;
const HOUR_MS = 3_600_000;
export function badgeFor(listenedMs: number | string | null | undefined, hidden: boolean | null | undefined): Badge | null {
  if (hidden) return null;
  const hours = Number(listenedMs ?? 0) / HOUR_MS;
  return hours >= 1000 ? 1000 : hours >= 500 ? 500 : hours >= 100 ? 100 : null;
}

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
  /** M10b US8: written by the show's proven creator. */
  host?: true;
  /** M11 (FR-016): the host hid it. Others get a placeholder; the author still reads it, marked. */
  hiddenByHost?: true;
  /** M12 (FR-023): the author's avatar letter — first letter or digit of the name, upper-cased; null for a placeholder. */
  initials: string | null;
  /** M19 US1: the author's photo; absent for a placeholder or an author without one. */
  avatarUrl?: string;
  /** M12 (FR-023): how many listeners liked it. */
  likeCount: number;
  /** M12 (FR-023): present only when signed in — whether the viewer is one of them. */
  likedByMe?: boolean;
  /** M19 US5: pinned by the show's host — first under every order. */
  pinned?: true;
  /** M22 US10 (FR-030, G-M22-11): pinned to the bottom by the show's host — last under every order. */
  pinnedBottom?: true;
  /** M19 US5: marked unfriendly by 5 or more listeners — folded behind "show"; never says by whom. */
  folded?: true;
  /** M19 US5: how many replies it has (the Smart sort and the "n replies" link). */
  replyCount?: number;
  /** M19 US6: a voice comment — its recording and length; M20 US3: its text, when there is one. */
  voice?: { url: string; ms: number; text?: string };
  /** M20 US9: its image, when there is one. */
  image?: { url: string; w: number; h: number };
  /** M21 US6: the region it was posted from (two letters), null when unknown or a placeholder. */
  country: string | null;
  /** M21 US6: the author's listening badge; null below 100 h, when hidden, or for a placeholder. */
  badge: Badge | null;
  /** M24 US8: waiting for the host's review — only its author is ever given it. */
  held?: true;
};

const SELECT = `SELECT c.id, c.episode_id, c.author_id, l.display_name, l.avatar_url, c.parent_id, c.body, c.offset_ms, c.created_at, c.deleted_at, c.removed_at, c.host_hidden_at,
                       c.pinned_at, c.pinned_bottom_at, c.voice_url, c.voice_ms, c.transcript, c.image_url, c.image_path, c.image_w, c.image_h,
                       c.country, l.listened_ms AS author_listened_ms, l.hide_badge AS author_hide_badge, l.hidden_at AS author_hidden_at
                FROM comments c LEFT JOIN listeners l ON l.id = c.author_id`;

export function toPublic(r: CommentRow, viewerId?: string): PublicComment {
  const removed = r.removed_at !== null;
  // M11 guard G-H1: a host-hidden comment is a placeholder for everyone except its author.
  const hostHidden = r.host_hidden_at != null && !removed && r.deleted_at === null;
  const authorSees = hostHidden && viewerId !== undefined && r.author_id === viewerId;
  const deleted = r.deleted_at !== null || removed || (hostHidden && !authorSees);
  return {
    id: r.id,
    authorId: deleted ? null : r.author_id,
    displayName: deleted ? null : r.display_name,
    body: deleted ? null : r.body,
    offsetMs: deleted ? null : r.offset_ms,
    parentId: r.parent_id,
    createdAt: new Date(r.created_at).toISOString(),
    deleted,
    initials: deleted ? null : initialsOf(r.display_name),
    ...(!deleted && r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
    ...(!deleted && r.pinned_at ? { pinned: true as const } : {}),
    ...(!deleted && r.pinned_bottom_at ? { pinnedBottom: true as const } : {}),
    ...(!deleted && r.voice_url && r.voice_ms ? { voice: { url: r.voice_url, ms: Number(r.voice_ms), ...(r.transcript ? { text: r.transcript } : {}) } } : {}),
    ...(!deleted && r.image_url && r.image_w && r.image_h ? { image: { url: r.image_url, w: Number(r.image_w), h: Number(r.image_h) } } : {}),
    likeCount: 0,
    country: deleted ? null : (r.country?.trim() || null),
    badge: deleted ? null : badgeFor(r.author_listened_ms, r.author_hide_badge),
    ...(viewerId !== undefined ? { likedByMe: false } : {}),
    ...(removed ? { removed: true } : {}),
    ...(hostHidden ? { hiddenByHost: true } : {}),
    ...((r as CommentRow & { blocked?: true }).blocked ? { blocked: true } : {}),
    ...((r as CommentRow & { reported?: true }).reported ? { reported: true } : {}),
    ...(viewerId !== undefined ? { mine: (!deleted || removed || authorSees) && r.author_id === viewerId } : {}),
  };
}

async function createCommentPg(
  db: Db,
  c: { episodeId: string; authorId: string; body: string | null; offsetMs?: number; parentId?: string; voice?: { url: string; path: string; ms: number; transcript?: string }; /** M21 US6: from countryOf() */ country?: string },
): Promise<CommentRow> {
  if (c.parentId) {
    const parent = (await db.query<{ episode_id: string; parent_id: string | null }>(
      'SELECT episode_id, parent_id FROM comments WHERE id = $1', [c.parentId],
    ))[0];
    if (!parent || parent.episode_id !== c.episodeId) throw new ApiError('not_found', 'That comment is not on this episode.');
    if (parent.parent_id !== null) throw new ApiError('reply_depth', 'You can reply to a comment, not to a reply.');
  }
  const [row] = await db.query<{ id: string }>(
    'INSERT INTO comments (episode_id, author_id, parent_id, body, offset_ms, voice_url, voice_path, voice_ms, transcript, country) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
    [c.episodeId, c.authorId, c.parentId ?? null, c.body, c.offsetMs ?? null, c.voice?.url ?? null, c.voice?.path ?? null, c.voice?.ms ?? null, c.voice?.transcript ?? null, c.country ?? null],
  );
  // M4 (research R4): a top-level comment is a feed item; replies are not.
  if (!c.parentId) {
    await db.query(
      `INSERT INTO activity (actor_id, kind, episode_id, moment_ms, ref_id, hidden) VALUES ($1, 'commented', $2, $3, $4, false)`,
      [c.authorId, c.episodeId, c.offsetMs ?? null, row!.id],
    );
  }
  // M21 US10 (G-M21-9): the reply and @name notices, in the caller's transaction.
  await notifyForComment(db, { id: row!.id, episodeId: c.episodeId, authorId: c.authorId, parentId: c.parentId ?? null, body: c.body });
  return (await db.query<CommentRow>(`${SELECT} WHERE c.id = $1`, [row!.id]))[0]!;
}

async function getCommentPg(db: Db, id: string): Promise<CommentRow | undefined> {
  return (await db.query<CommentRow>(`${SELECT} WHERE c.id = $1`, [id]))[0];
}

/**
 * M23 US4 (FR-007, G-M23-6): the ONE way a comment becomes a placeholder — deleting one comment
 * and deleting a whole account both use it, so a placeholder never keeps its words, transcript,
 * voice, picture or country. `{ authorId }` is set-based: every comment by that listener that
 * has replies, in one statement (an account with thousands of comments is one UPDATE, not
 * thousands). Blobs are removed by the caller first (finishDeletion) or by the sweeps.
 */
async function placeholderCommentsPg(db: Db, by: { id: string } | { authorId: string }): Promise<{ id: string; episode_id: string }[]> {
  const set = `body = NULL, author_id = NULL, offset_ms = NULL, voice_url = NULL, voice_path = NULL, voice_ms = NULL, transcript = NULL,
               image_url = NULL, image_path = NULL, image_w = NULL, image_h = NULL, image_bytes = NULL, country = NULL, deleted_at = now()`;
  if ('id' in by) return db.query(`UPDATE comments SET ${set} WHERE id = $1 RETURNING id, episode_id`, [by.id]);
  return db.query(
    `UPDATE comments c SET ${set}
      WHERE c.author_id = $1 AND EXISTS (SELECT 1 FROM comments r WHERE r.parent_id = c.id)
      RETURNING c.id, c.episode_id`,
    [by.authorId],
  );
}

/**
 * FR-010: a comment with replies becomes a placeholder (body/author/moment NULL,
 * deleted_at set) so the replies keep their context; one without is removed.
 * Returns whether a placeholder was left, and the episode (for the heat rebuild).
 */
async function deleteCommentPg(db: Db, id: string): Promise<{ placeholder: boolean; episodeId: string }> {
  const row = (await db.query<{ episode_id: string; replies: number }>(
    'SELECT episode_id, (SELECT count(*)::int FROM comments r WHERE r.parent_id = c.id) AS replies FROM comments c WHERE c.id = $1',
    [id],
  ))[0];
  if (!row) throw new ApiError('not_found', 'No such comment.');
  await db.query(`DELETE FROM activity WHERE kind = 'commented' AND ref_id = $1`, [id]); // M4: gone from feeds either way
  if (Number(row.replies) > 0) {
    await placeholderComments(db, { id });
    return { placeholder: true, episodeId: row.episode_id };
  }
  await db.query('DELETE FROM comments WHERE id = $1', [id]);
  return { placeholder: false, episodeId: row.episode_id };
}

/**
 * Top-level newest first (M21 US6: `dir: 'asc'` turns that to oldest first), each with its replies
 * oldest first (contracts/api.md).
 */
async function listCommentsPg(db: Db, episodeId: string, viewerId?: string, opts: { dir?: 'asc' | 'desc' } = {}): Promise<PublicComment[]> {
  const fetchedAll = await db.query<CommentRow>(`${SELECT} WHERE c.episode_id = $1 ORDER BY c.created_at ASC`, [episodeId]);
  // M12 (FR-023): like counts in one grouped read.
  const likes = await likesOnEpisode(db, episodeId, viewerId);
  // M19 US5: which comments 5 or more listeners marked unfriendly (counts only, never who).
  const folded = await foldedOnEpisode(db, episodeId);
  return buildThreads(db, fetchedAll, episodeId, viewerId, opts, likes, folded);
}

/**
 * The episode's comments (oldest first, every row) shaped for one viewer: hidden accounts, mutes, blocks and
 * reports applied, Host marks, like counts, folds, held comments, threads and the two pins. Shared by the
 * Postgres and the DynamoDB bodies (M26 lane SC), so the answer is built by the same code on both.
 */
export async function buildThreads(
  db: Db, fetchedAll: CommentRow[], episodeId: string, viewerId: string | undefined, opts: { dir?: 'asc' | 'desc' },
  likes: Map<string, LikeState>, folded: Set<string>,
): Promise<PublicComment[]> {
  // M22 US11 (G-M22-8): an account waiting to be deleted is hidden from everyone else — its comments
  // and the replies under them, the way a mute hides them; Keep brings them all back.
  const fetched = fetchedAll.filter((r) => r.author_hidden_at == null || (viewerId !== undefined && r.author_id === viewerId));
  // M21 US6 (G-M21-6): the viewer's muted listeners are gone from the viewer's reads only — their
  // comments and their replies. A reply under a muted listener's comment goes with it.
  const all = viewerId === undefined ? fetched : await withoutMuted(db, fetched, viewerId);
  // M6 (R1, G1): a signed-in viewer never sees a blocked listener's comments or what they reported.
  const rows = viewerId === undefined ? all : await filterForViewer(db, all, viewerId);
  const byId = new Map<string, PublicComment>();
  const top: PublicComment[] = [];
  // M10b US8 + M14: the show's proven creator's and invited hosts' comments carry a Host mark.
  const hosts = new Set(await hostsOfEpisode(db, episodeId));
  for (const r of rows) {
    const plain = toPublic(r, viewerId);
    const l = likes.get(r.id);
    const base = l ? { ...plain, likeCount: l.likeCount, ...(viewerId !== undefined ? { likedByMe: l.likedByMe } : {}) } : plain;
    const hosted = base.authorId !== null && hosts.has(base.authorId) ? { ...base, host: true as const } : base;
    const c = folded.has(r.id) && !hosted.deleted ? { ...hosted, folded: true as const } : hosted;
    byId.set(c.id, c);
    if (c.parentId === null) top.push({ ...c, replies: [] });
  }
  // M24 US8 (G-M24-1): the viewer's own comments held for review, marked `held`; nobody else gets them.
  const held = viewerId === undefined ? [] : await heldForAuthor(db, episodeId, viewerId);
  if (held.some((h) => h.parentId === null)) {
    for (const h of held) if (h.parentId === null) top.push({ ...h, replies: [] });
    top.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const topById = new Map(top.map((c) => [c.id, c]));
  for (const r of rows) {
    if (r.parent_id === null) continue;
    topById.get(r.parent_id)?.replies!.push(byId.get(r.id)!);
  }
  for (const h of held) if (h.parentId !== null) topById.get(h.parentId)?.replies!.push(h);
  const ordered = opts.dir === 'asc' ? top : top.reverse();
  // M22 US10 (G-M22-11): the bottom pin is last whichever way the list reads.
  const bottom = ordered.filter((c) => c.pinnedBottom === true);
  if (bottom.length > 0) ordered.splice(0, ordered.length, ...ordered.filter((c) => c.pinnedBottom !== true), ...bottom);
  return ordered.map((c) => ({ ...c, replyCount: c.replies!.length }));
}

/** M21 US6 (G-M21-6): drop what the viewer's muted listeners wrote. */
async function withoutMuted(db: Db, rows: CommentRow[], viewerId: string): Promise<CommentRow[]> {
  const muted = await mutedIdsFor(db, viewerId);
  if (muted.size === 0) return rows;
  return rows.filter((r) => r.author_id === null || !muted.has(r.author_id));
}

/** Blocked authors and reported ids out; a blocked reply under a kept parent stays as a placeholder row. */
async function filterForViewer(db: Db, rows: CommentRow[], viewerId: string): Promise<CommentRow[]> {
  const [blocked, hidden] = await Promise.all([blockedIdsFor(db, viewerId), hiddenFor(db, viewerId)]);
  if (blocked.size === 0 && hidden.keys.size === 0) return rows;
  const named = rows.map((r) => ({ id: r.id, authorId: r.author_id, parentId: r.parent_id, key: hiddenKey('comment', r.id), row: r }));
  return applyBlocks(named, blocked, hidden.keys).map((i) => {
    if (!('placeholder' in i)) return i.row;
    const original = rows.find((r) => r.id === i.id)!;
    const bare = { ...original, author_id: null, display_name: null, body: null, offset_ms: null, deleted_at: new Date(0), removed_at: null, voice_url: null, voice_ms: null, transcript: null, image_url: null, image_path: null, image_w: null, image_h: null, pinned_at: null, pinned_bottom_at: null };
    return (i.placeholder === 'reported'
      ? { ...bare, reported: true }
      : { ...bare, blocked: true }) as CommentRow & { blocked?: true; reported?: true };
  });
}

/**
 * M21 US6 (G-M21-7): a comment — text or voice — waits until its author accepted the community
 * rules (`POST /v1/me/rules`). The phone shows the rules on this 428 and resends after Accept.
 */
async function requireRulesAcceptedPg(db: Db, listenerId: string): Promise<void> {
  const [r] = await db.query<{ rules_accepted_at: Date | string | null }>('SELECT rules_accepted_at FROM listeners WHERE id = $1', [listenerId]);
  if (!r || r.rules_accepted_at === null) throw new ApiError('rules_required', 'Please read and accept the community rules before your first comment.');
}

/** M19 US5 (FR-041): a comment folds once this many listeners marked it unfriendly. */
export const UNFRIENDLY_FOLD_AT = 5;

/** The ids on this episode that reached the fold — the voters are never read. */
async function foldedOnEpisodePg(db: Db, episodeId: string): Promise<Set<string>> {
  const rows = await db.query<{ comment_id: string }>(
    `SELECT u.comment_id FROM comment_unfriendly u JOIN comments c ON c.id = u.comment_id
     WHERE c.episode_id = $1 GROUP BY u.comment_id HAVING count(*) >= $2`,
    [episodeId, UNFRIENDLY_FOLD_AT],
  );
  return new Set(rows.map((r) => r.comment_id));
}

/** M26 lane SC: the moderation take-down (lane SF's act) and its undo (appeals) — one place, so both backends stay in step. */
async function setCommentRemovedPg(db: Db, id: string, removed: boolean): Promise<boolean> {
  const rows = removed
    ? await db.query('UPDATE comments SET removed_at = now() WHERE id = $1 AND removed_at IS NULL RETURNING id', [id])
    : await db.query('UPDATE comments SET removed_at = NULL WHERE id = $1 AND removed_at IS NOT NULL RETURNING id', [id]);
  return rows.length > 0;
}

/** M26 lane SC: the host's hide in the Studio (lane ST) and its undo; `by` = the host, null = show again. */
async function setCommentHostHiddenPg(db: Db, id: string, by: string | null): Promise<boolean> {
  const rows = by !== null
    ? await db.query('UPDATE comments SET host_hidden_at = now(), host_hidden_by = $2 WHERE id = $1 AND host_hidden_at IS NULL RETURNING id', [id, by])
    : await db.query('UPDATE comments SET host_hidden_at = NULL, host_hidden_by = NULL WHERE id = $1 AND host_hidden_at IS NOT NULL RETURNING id', [id]);
  return rows.length > 0;
}

// M26 lane SC: each function runs on Postgres, or on DynamoDB (`ddb/comments.ts`) when the Db carries a Store (db/backend.ts).
export const createComment = dual('sc/comments', 'createComment', createCommentPg);
export const getComment = dual('sc/comments', 'getComment', getCommentPg);
export const placeholderComments = dual('sc/comments', 'placeholderComments', placeholderCommentsPg);
export const deleteComment = dual('sc/comments', 'deleteComment', deleteCommentPg);
export const listComments = dual('sc/comments', 'listComments', listCommentsPg);
export const requireRulesAccepted = dual('sc/comments', 'requireRulesAccepted', requireRulesAcceptedPg);
export const foldedOnEpisode = dual('sc/comments', 'foldedOnEpisode', foldedOnEpisodePg);
export const setCommentRemoved = dual('sc/comments', 'setCommentRemoved', setCommentRemovedPg);
export const setCommentHostHidden = dual('sc/comments', 'setCommentHostHidden', setCommentHostHiddenPg);
