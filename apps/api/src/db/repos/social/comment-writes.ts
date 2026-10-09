// Comment writes the comment routes run: the rate floor, posting and deleting in a transaction, images, reactions.
import { bucketOf } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { upsertEpisode, type EpisodeRow } from '../library/episodes.ts';
import { countryOf } from '../account/country.ts';
import { rebuildEpisodeHeat } from '../../../heat/rebuild.ts';
import { createComment, deleteComment, type CommentRow } from './comments.ts';
import { like, type LikeState } from './comment-likes.ts';

/** The comment rate floor: this author's comments within the last `floorMs` milliseconds (a string). */
export async function recentCommentRows(db: Db, authorId: string, floorMs: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM comments WHERE author_id = $1 AND created_at > now() - ($2 || ' milliseconds')::interval`,
    [authorId, floorMs],
  );
}

/** POST /v1/episodes/:id/comments: fill a missing duration, create the comment, rebuild heat — one transaction. */
export async function postCommentInTx(
  db: Db,
  episode: EpisodeRow,
  episodeId: string,
  listenerId: string,
  body: { body: string; offsetMs?: number | undefined; parentId?: string | undefined; durationMs?: number | undefined },
  countryHeader: string | undefined,
): Promise<CommentRow> {
  return db.transaction(async (tx) => {
    if (body.durationMs !== undefined && episode.duration_ms === null) {
      await upsertEpisode(tx, {
        id: episode.id, feedUrl: episode.feed_url, guid: episode.guid, title: episode.title,
        enclosureUrl: episode.enclosure_url, durationMs: body.durationMs,
      });
    }
    // M21 US6: the region the server saw now — two letters, never a city (G-I1).
    const country = countryOf(countryHeader);
    const row = await createComment(tx, { episodeId, authorId: listenerId, body: body.body, offsetMs: body.offsetMs, parentId: body.parentId, ...(country ? { country } : {}) });
    if (body.offsetMs !== undefined) await rebuildEpisodeHeat(tx, episodeId);
    return row;
  });
}

/** DELETE /v1/comments/:id: delete (or placeholder) and rebuild heat — one transaction. */
export async function deleteCommentInTx(db: Db, id: string): Promise<{ placeholder: boolean; episodeId: string }> {
  return db.transaction(async (tx) => {
    const r = await deleteComment(tx, id);
    await rebuildEpisodeHeat(tx, r.episodeId);
    return r;
  });
}

/** PUT /v1/comments/:id/like inside a transaction. */
export async function likeCommentInTx(db: Db, commentId: string, listenerId: string): Promise<LikeState> {
  return db.transaction((tx) => like(tx, commentId, listenerId));
}

/** POST /v1/episodes/:id/comments/voice: create the voice comment and rebuild heat — one transaction. */
export async function postVoiceCommentInTx(
  db: Db,
  episodeId: string,
  authorId: string,
  v: { offsetMs: number | undefined; parentId: string | undefined; url: string; path: string; ms: number; transcript: string | undefined; country: string | undefined },
): Promise<CommentRow> {
  const { offsetMs, parentId, transcript, country } = v;
  return db.transaction(async (tx) => {
    const row = await createComment(tx, { episodeId, authorId, body: null, ...(offsetMs !== undefined ? { offsetMs } : {}), ...(parentId ? { parentId } : {}), voice: { url: v.url, path: v.path, ms: v.ms, ...(transcript ? { transcript } : {}) }, ...(country ? { country } : {}) });
    if (offsetMs !== undefined) await rebuildEpisodeHeat(tx, episodeId);
    return row;
  });
}

/** Bytes held by comment images, live and held for review. */
export async function commentImageBytesRows(db: Db): Promise<{ n: string | number | null }[]> {
  return db.query<{ n: string | number | null }>(
    'SELECT (SELECT coalesce(sum(image_bytes), 0) FROM comments) + (SELECT coalesce(sum(image_bytes), 0) FROM held_comments) AS n');
}

/** Attach a stored image to a live comment. */
export async function setCommentImage(db: Db, id: string, url: string, path: string, w: number, h: number, bytes: number): Promise<void> {
  await db.query('UPDATE comments SET image_url = $2, image_path = $3, image_w = $4, image_h = $5, image_bytes = $6 WHERE id = $1', [id, url, path, w, h, bytes]);
}

/**
 * PUT /v1/episodes/:id/reactions: the toggle, in one transaction — fill a missing duration,
 * remove this listener's reaction in the segment or add one, rebuild heat.
 */
export async function toggleReactionInTx(
  db: Db,
  found: EpisodeRow,
  episodeId: string,
  listenerId: string,
  body: { offsetMs: number; durationMs?: number | undefined },
): Promise<{ reacted: boolean; bucket: number }> {
  let episode: EpisodeRow = found;
  return db.transaction(async (tx) => {
    if (episode!.duration_ms === null && body.durationMs !== undefined) {
      episode = await upsertEpisode(tx, {
        id: episode!.id, feedUrl: episode!.feed_url, guid: episode!.guid, title: episode!.title,
        enclosureUrl: episode!.enclosure_url, durationMs: body.durationMs,
      });
    }
    if (episode!.duration_ms === null) {
      throw new ApiError('duration_unknown', "This episode's length isn't known yet, so a moment can't be placed.");
    }
    const bucket = bucketOf(body.offsetMs, episode!.duration_ms);
    const removed = await tx.query<{ bucket: number }>(
      'DELETE FROM reactions WHERE listener_id = $1 AND episode_id = $2 AND bucket = $3 RETURNING bucket',
      [listenerId, episodeId, bucket],
    );
    let reacted = false;
    if (removed.length === 0) {
      await tx.query(
        'INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms) VALUES ($1, $2, $3, $4)',
        [listenerId, episodeId, bucket, body.offsetMs],
      );
      reacted = true;
    }
    await rebuildEpisodeHeat(tx, episodeId);
    return { reacted, bucket };
  });
}
