// Comment routes: post, delete and like comments on an episode.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth, requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { getEpisode, upsertEpisode } from '../../db/repos/library/episodes.ts';
import { createComment, deleteComment, getComment, toPublic } from '../../db/repos/social/comments.ts';
import { rebuildEpisodeHeat } from '../../heat/rebuild.ts';
import { isBlockedBy } from '../../db/repos/safety/blocks.ts';
import { isMutedOn } from '../../db/repos/studio/studio-subscribers.ts';
import { like, unlike } from '../../db/repos/social/comment-likes.ts';
import { setPinned, setUnfriendly, thread } from '../../db/repos/social/comment-extras.ts';

const commentBody = z.object({
  body: z.string().trim().min(1).max(2000),
  offsetMs: z.number().int().min(0).optional(),
  parentId: z.string().uuid().optional(),
  durationMs: z.number().int().positive().optional(),
});

/** Rate floor (contracts/api.md "Limits"): one comment per 5 s per listener. */
const RATE_FLOOR_MS = 5_000;

export const comments = new Hono<AuthEnv>();

/** Mounted at /v1/episodes — POST /v1/episodes/:id/comments */
comments.post('/:id/comments', requireAuth, json(commentBody), async (c) => {
  const episodeId = c.req.param('id');
  const body = c.req.valid('json');
  const db = c.get('db');
  const listener = c.get('listener')!;

  const episode = await getEpisode(db, episodeId);
  if (!episode) throw new ApiError('not_found', 'Register the episode first (PUT /v1/episodes/:id).');

  const recent = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM comments WHERE author_id = $1 AND created_at > now() - ($2 || ' milliseconds')::interval`,
    [listener.id, String(RATE_FLOOR_MS)],
  );
  if (Number(recent[0]?.n ?? 0) > 0) throw new ApiError('locked', 'One comment every few seconds, please.', { retryAfterSeconds: 5 });
  // M6 (FR-008): no reply to a listener who blocked you.
  if (body.parentId) {
    const parent = await getComment(db, body.parentId);
    if (parent?.author_id && parent.author_id !== listener.id && (await isBlockedBy(db, parent.author_id, listener.id))) {
      throw new ApiError('blocked', "You can't interact with this listener.");
    }
  }
  // M11 (FR-019, G-M1): the show's host turned off comments for this listener, on this show only.
  if (await isMutedOn(db, episode.feed_url, listener.id)) {
    throw new ApiError('muted_on_show', 'The host has turned off comments for you on this show.');
  }

  const created = await db.transaction(async (tx) => {
    if (body.durationMs !== undefined && episode.duration_ms === null) {
      await upsertEpisode(tx, {
        id: episode.id, feedUrl: episode.feed_url, guid: episode.guid, title: episode.title,
        enclosureUrl: episode.enclosure_url, durationMs: body.durationMs,
      });
    }
    const row = await createComment(tx, { episodeId, authorId: listener.id, body: body.body, offsetMs: body.offsetMs, parentId: body.parentId });
    if (body.offsetMs !== undefined) await rebuildEpisodeHeat(tx, episodeId);
    return row;
  });
  return c.json({ comment: toPublic(created, listener.id) });
});

/** Mounted at /v1/comments — DELETE /v1/comments/:id */
export const commentById = new Hono<AuthEnv>();

commentById.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const db = c.get('db');
  const listener = c.get('listener')!;
  const existing = await getComment(db, id);
  if (!existing || existing.deleted_at !== null) throw new ApiError('not_found', 'No such comment.');
  if (existing.author_id !== listener.id) throw new ApiError('forbidden', 'Only the author can delete a comment.');
  const result = await db.transaction(async (tx) => {
    const r = await deleteComment(tx, id);
    await rebuildEpisodeHeat(tx, r.episodeId);
    return r;
  });
  return c.json({ placeholder: result.placeholder });
});

/**
 * M12 (FR-023) — PUT/DELETE /v1/comments/:id/like. Both idempotent; both answer the new
 * count. Your own comment is 403 `own_comment` (guard G-C2); a comment you cannot see is 404.
 */
commentById.put('/:id/like', requireAuth, async (c) =>
  c.json(await like(c.get('db'), c.req.param('id'), c.get('listener')!.id)));

commentById.delete('/:id/like', requireAuth, async (c) =>
  c.json(await unlike(c.get('db'), c.req.param('id'), c.get('listener')!.id)));

/** M19 US5 (FR-040): PUT/DELETE /v1/comments/:id/pin — the show's host only. */
commentById.put('/:id/pin', requireAuth, async (c) => {
  await setPinned(c.get('db'), c.req.param('id'), c.get('listener')!.id, true);
  return c.body(null, 204);
});
commentById.delete('/:id/pin', requireAuth, async (c) => {
  await setPinned(c.get('db'), c.req.param('id'), c.get('listener')!.id, false);
  return c.body(null, 204);
});

/** M19 US5 (FR-041): PUT/DELETE /v1/comments/:id/unfriendly → { folded }. Never says who marked it. */
commentById.put('/:id/unfriendly', requireAuth, async (c) => c.json(await setUnfriendly(c.get('db'), c.req.param('id'), c.get('listener')!.id, true)));
commentById.delete('/:id/unfriendly', requireAuth, async (c) => c.json(await setUnfriendly(c.get('db'), c.req.param('id'), c.get('listener')!.id, false)));

/** M19 US5 (FR-043): GET /v1/comments/:id/thread → { parent, replies } for the reply page. */
commentById.get('/:id/thread', optionalAuth, async (c) => {
  const t = await thread(c.get('db'), c.req.param('id'), c.get('listener')?.id);
  if (!t) throw new ApiError('not_found', 'No such comment.');
  return c.json(t);
});
