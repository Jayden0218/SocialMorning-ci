// Comment control per show and per episode: open, closed, or held for the host's review.
/**
 * M24 US8 (specs/025-m24-gaps-and-look). The host sets the whole show, or one episode, to
 * `open`, `closed` or `review`; an episode's own setting wins over the show's. No row = open.
 *
 *  - closed → the comment POST answers 403 `comments_closed`.
 *  - review → the comment is written to `held_comments`, never to `comments`, so no read of
 *    `comments` anywhere (threads, heat, counts, feeds, notices) can show it. Its author reads
 *    it in `listComments` (marked `held`); Approve moves it into `comments` through the app's
 *    own `createComment` (activity, notices, heat), Reject deletes it.
 *
 * The show's team (proven owner, invited hosts, operators) is never refused or held.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { rebuildEpisodeHeat } from '../../../heat/rebuild.ts';
import { countryOf } from '../account/country.ts';
import { initialsOf } from '../social/comment-likes.ts';
import { createComment, type PublicComment } from '../social/comments.ts';
import { setCommentImage } from '../social/comment-writes.ts';
import type { ImageStorage } from '../../../storage/image-store.ts';

export type CommentMode = 'open' | 'closed' | 'review';
export const MODES: readonly CommentMode[] = ['open', 'closed', 'review'];

/** The episode's own setting, else the show's, else open. */
export async function modeFor(db: Db, feedUrl: string, episodeId: string): Promise<CommentMode> {
  const rows = await db.query<{ episode_id: string; mode: CommentMode }>(
    "SELECT episode_id, mode FROM comment_policy WHERE feed_url = $1 AND episode_id IN ('', $2)", [feedUrl, episodeId]);
  return (rows.find((r) => r.episode_id === episodeId) ?? rows.find((r) => r.episode_id === ''))?.mode ?? 'open';
}

/** The show's setting and every episode that has its own. */
export async function policyOf(db: Db, feedUrl: string): Promise<{ show: CommentMode; episodes: { episodeId: string; mode: CommentMode }[] }> {
  const rows = await db.query<{ episode_id: string; mode: CommentMode }>('SELECT episode_id, mode FROM comment_policy WHERE feed_url = $1 ORDER BY updated_at DESC', [feedUrl]);
  return {
    show: rows.find((r) => r.episode_id === '')?.mode ?? 'open',
    episodes: rows.filter((r) => r.episode_id !== '').map((r) => ({ episodeId: r.episode_id, mode: r.mode })),
  };
}

/** Sets the show's mode (`episodeId` empty) or one episode's. `null` on an episode = follow the show again. */
export async function setPolicy(db: Db, feedUrl: string, episodeId: string, mode: CommentMode | null, by: string): Promise<void> {
  if (episodeId !== '') {
    const [e] = await db.query('SELECT 1 FROM episodes WHERE id = $1 AND feed_url = $2', [episodeId, feedUrl]);
    if (!e) throw new ApiError('not_found', 'That episode is not on this show.');
  }
  if (mode === null) {
    await db.query('DELETE FROM comment_policy WHERE feed_url = $1 AND episode_id = $2', [feedUrl, episodeId]);
    return;
  }
  await db.query(
    `INSERT INTO comment_policy (feed_url, episode_id, mode, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (feed_url, episode_id) DO UPDATE SET mode = EXCLUDED.mode, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [feedUrl, episodeId, mode, by]);
}

/** The owner, invited hosts and operators of the show. */
async function isTeam(db: Db, feedUrl: string, listenerId: string): Promise<boolean> {
  const [r] = await db.query(
    `SELECT 1 WHERE EXISTS (SELECT 1 FROM creator_claims WHERE feed_url = $1 AND listener_id = $2 AND status = 'proven')
        OR (EXISTS (SELECT 1 FROM creator_claims WHERE feed_url = $1 AND status = 'proven')
            AND (EXISTS (SELECT 1 FROM show_hosts WHERE feed_url = $1 AND listener_id = $2)
              OR EXISTS (SELECT 1 FROM show_members WHERE feed_url = $1 AND listener_id = $2)))`,
    [feedUrl, listenerId]);
  return Boolean(r);
}

type HeldRow = {
  id: string; episode_id: string; author_id: string; parent_id: string | null; body: string; offset_ms: number | null; country: string | null; created_at: Date | string; display_name: string | null; avatar_url: string | null;
  /** Fix F-S (migration 026): a picture added while the comment waits. */
  image_url: string | null; image_path: string | null; image_w: number | null; image_h: number | null; image_bytes: number | null;
};

/** How the author sees their own held comment. Nobody else is ever given one. */
export function heldToPublic(r: HeldRow): PublicComment & { held: true } {
  return {
    id: r.id, authorId: r.author_id, displayName: r.display_name, body: r.body, offsetMs: r.offset_ms, parentId: r.parent_id,
    createdAt: new Date(r.created_at).toISOString(), deleted: false, initials: initialsOf(r.display_name),
    ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
    ...(r.image_url && r.image_w && r.image_h ? { image: { url: r.image_url, w: Number(r.image_w), h: Number(r.image_h) } } : {}),
    likeCount: 0, likedByMe: false, country: r.country?.trim() || null, badge: null, mine: true, held: true,
  };
}

const HELD_SELECT = `SELECT h.id, h.episode_id, h.author_id, h.parent_id, h.body, h.offset_ms, h.country, h.created_at, l.display_name, l.avatar_url,
                            h.image_url, h.image_path, h.image_w, h.image_h, h.image_bytes
                     FROM held_comments h JOIN listeners l ON l.id = h.author_id`;

/** Fix F-S: a held comment, for the image upload (which checks author, age and an existing picture). */
export async function heldForImage(db: Db, id: string): Promise<HeldRow | undefined> {
  return (await db.query<HeldRow>(`${HELD_SELECT} WHERE h.id = $1`, [id]))[0];
}

/** Fix F-S: puts the picture on the author's held comment; undefined when it is gone or already has one. */
export async function setHeldImage(
  db: Db, id: string, authorId: string, im: { url: string; path: string; w: number; h: number; bytes: number },
): Promise<HeldRow | undefined> {
  const [r] = await db.query<{ id: string }>(
    `UPDATE held_comments SET image_url = $3, image_path = $4, image_w = $5, image_h = $6, image_bytes = $7
      WHERE id = $1 AND author_id = $2 AND image_path IS NULL RETURNING id`, [id, authorId, im.url, im.path, im.w, im.h, im.bytes]);
  return r ? heldForImage(db, id) : undefined;
}

/**
 * The one call in the comment POST (US8): `closed` throws 403 `comments_closed`; `review` holds
 * the comment and returns what its author sees; `open` (or the team) returns null — post as usual.
 */
export async function commentControl(
  db: Db, episode: { id: string; feed_url: string }, authorId: string,
  c: { body: string; offsetMs?: number | undefined; parentId?: string | undefined; countryHeader?: string | undefined },
): Promise<(PublicComment & { held: true }) | null> {
  const mode = await modeFor(db, episode.feed_url, episode.id);
  if (mode === 'open' || (await isTeam(db, episode.feed_url, authorId))) return null;
  if (mode === 'closed') throw new ApiError('comments_closed', 'The host has closed comments here.');
  if (c.parentId) {
    const [p] = await db.query<{ episode_id: string; parent_id: string | null }>('SELECT episode_id, parent_id FROM comments WHERE id = $1', [c.parentId]);
    if (!p || p.episode_id !== episode.id) throw new ApiError('not_found', 'That comment is not on this episode.');
    if (p.parent_id !== null) throw new ApiError('reply_depth', 'You can reply to a comment, not to a reply.');
  }
  // The same 5 s floor as a posted comment (the route's floor reads `comments` only).
  const [recent] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM held_comments WHERE author_id = $1 AND created_at > now() - interval '5 seconds'", [authorId]);
  if (Number(recent?.n ?? 0) > 0) throw new ApiError('locked', 'One comment every few seconds, please.', { retryAfterSeconds: 5 });
  const country = countryOf(c.countryHeader);
  const [row] = await db.query<{ id: string }>(
    'INSERT INTO held_comments (episode_id, author_id, parent_id, body, offset_ms, country) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [episode.id, authorId, c.parentId ?? null, c.body, c.offsetMs ?? null, country ?? null]);
  return heldToPublic((await db.query<HeldRow>(`${HELD_SELECT} WHERE h.id = $1`, [row!.id]))[0]!);
}

/** For a non-text comment (voice): closed refuses, and review refuses too — only text can wait for review. */
export async function requireOpenForVoice(db: Db, episode: { id: string; feed_url: string }, authorId: string): Promise<void> {
  const mode = await modeFor(db, episode.feed_url, episode.id);
  if (mode === 'open' || (await isTeam(db, episode.feed_url, authorId))) return;
  throw new ApiError('comments_closed', mode === 'closed' ? 'The host has closed comments here.' : 'The host checks comments here first. Write your comment instead.');
}

/** The viewer's own held comments on one episode, oldest first. */
export async function heldForAuthor(db: Db, episodeId: string, authorId: string): Promise<(PublicComment & { held: true })[]> {
  return (await db.query<HeldRow>(`${HELD_SELECT} WHERE h.episode_id = $1 AND h.author_id = $2 ORDER BY h.created_at`, [episodeId, authorId])).map(heldToPublic);
}

/** Changes when the viewer's held comments on the episode change (the poll's ETag). */
export async function heldStamp(db: Db, episodeId: string, viewerId: string | undefined): Promise<string> {
  if (!viewerId) return '-';
  const [r] = await db.query<{ s: string | null }>(
    "SELECT count(*)::text || '/' || count(image_path)::text || '/' || coalesce(max(created_at)::text, '-') AS s FROM held_comments WHERE episode_id = $1 AND author_id = $2", [episodeId, viewerId]);
  return r?.s ?? '-';
}

export type PendingComment = { id: string; episodeId: string; episodeTitle: string; author: { id: string; displayName: string }; body: string; offsetMs: number | null; parentId: string | null; createdAt: string };

/** Studio › Comments › Pending: the show's held comments, oldest first (first come, first checked). */
export async function listPending(db: Db, feedUrl: string, episodeId?: string): Promise<PendingComment[]> {
  const rows = await db.query<HeldRow & { title: string }>(
    `SELECT h.id, h.episode_id, h.author_id, h.parent_id, h.body, h.offset_ms, h.country, h.created_at, l.display_name, l.avatar_url, e.title
       FROM held_comments h JOIN listeners l ON l.id = h.author_id JOIN episodes e ON e.id = h.episode_id
      WHERE e.feed_url = $1 AND ($2::text IS NULL OR h.episode_id = $2::text)
      ORDER BY h.created_at LIMIT 200`, [feedUrl, episodeId ?? null]);
  return rows.map((r) => ({
    id: r.id, episodeId: r.episode_id, episodeTitle: r.title, author: { id: r.author_id, displayName: r.display_name ?? '' },
    body: r.body, offsetMs: r.offset_ms, parentId: r.parent_id, createdAt: new Date(r.created_at).toISOString(),
  }));
}

async function heldOnShow(db: Db, feedUrl: string, id: string): Promise<HeldRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return (await db.query<HeldRow>(`${HELD_SELECT} JOIN episodes e ON e.id = h.episode_id WHERE h.id = $1 AND e.feed_url = $2`, [id, feedUrl]))[0];
}

/** Approve: the comment joins the episode as if posted now — the app's own create (activity, notices) and heat. */
export async function approveHeld(db: Db, feedUrl: string, id: string): Promise<{ commentId: string }> {
  return db.transaction(async (tx) => {
    const h = await heldOnShow(tx, feedUrl, id);
    if (!h) throw new ApiError('not_found', 'No such comment waiting on this show.');
    await tx.query('DELETE FROM held_comments WHERE id = $1', [id]);
    const parentLive = h.parent_id ? (await tx.query('SELECT 1 FROM comments WHERE id = $1', [h.parent_id])).length > 0 : true;
    const created = await createComment(tx, {
      episodeId: h.episode_id, authorId: h.author_id, body: h.body,
      ...(h.offset_ms !== null ? { offsetMs: Number(h.offset_ms) } : {}),
      ...(h.parent_id && parentLive ? { parentId: h.parent_id } : {}),
      ...(h.country ? { country: h.country.trim() } : {}),
    });
    // Fix F-S: the picture added while it waited moves with it (the file stays where it is).
    if (h.image_path) {
      // M26 lane SC: through the comment lane's repo, so it reaches the comment wherever it lives (same SQL on Postgres).
      await setCommentImage(tx, created.id, String(h.image_url), String(h.image_path), Number(h.image_w), Number(h.image_h), Number(h.image_bytes));
    }
    if (h.offset_ms !== null) await rebuildEpisodeHeat(tx, h.episode_id);
    return { commentId: created.id };
  });
}

/**
 * Reject: the held comment is deleted; nobody but its author ever saw it. Fix F-S: its picture
 * is deleted from the image store too (a failed delete is logged; the row is gone either way).
 */
export async function rejectHeld(db: Db, feedUrl: string, id: string, images?: ImageStorage): Promise<void> {
  const h = await heldOnShow(db, feedUrl, id);
  if (!h) throw new ApiError('not_found', 'No such comment waiting on this show.');
  await db.query('DELETE FROM held_comments WHERE id = $1', [id]);
  if (h.image_path && images?.ready) {
    try { await images.remove(h.image_path); } catch (e) { console.error('held comment image remove', e instanceof Error ? e.message : String(e)); }
  }
}
