// Like routes: like an episode with a note, unlike, my timeline, one account's likes, like posts.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth, requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { addLikeComment, clearLikeReaction, deleteLikeComment, like, likePost, likesOf, myLike, setLikeReaction, timeline, unlike, visibleLike } from '../../db/repos/social/likes.ts';
import { notify } from '../../db/repos/social/notifications.ts';

const before = z.string().datetime().optional();
const UUID = /^[0-9a-f-]{36}$/i;

async function episodeExists(db: AuthEnv['Variables']['db'], id: string): Promise<boolean> {
  const [r] = await db.query<{ id: string }>('SELECT id FROM episodes WHERE id = $1', [id]);
  return r !== undefined;
}

/** M19 US3 — mounted at /v1/episodes: GET/PUT/DELETE /:id/like. */
export const episodeLikes = new Hono<AuthEnv>();

episodeLikes.get('/:id/like', requireAuth, async (c) => c.json(await myLike(c.get('db'), c.get('listener')!.id, c.req.param('id'))));

episodeLikes.put('/:id/like', requireAuth, json(z.object({ note: z.string().trim().max(140).optional() })), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  if (!(await episodeExists(db, id))) throw new ApiError('not_found', 'No such episode.');
  const note = c.req.valid('json').note;
  await like(db, c.get('listener')!.id, id, note === '' ? undefined : note);
  return c.json(await myLike(db, c.get('listener')!.id, id));
});

episodeLikes.delete('/:id/like', requireAuth, async (c) => {
  await unlike(c.get('db'), c.get('listener')!.id, c.req.param('id'));
  return c.body(null, 204);
});

/** M19 US3 — mounted at /v1/me/likes: GET /timeline?before=. */
export const likeTimeline = new Hono<AuthEnv>();

likeTimeline.get('/timeline', requireAuth, async (c) => {
  const b = before.safeParse(c.req.query('before'));
  if (!b.success) throw new ApiError('validation', 'before must be an ISO time.', { fields: ['before'] });
  return c.json(await timeline(c.get('db'), c.get('listener')!.id, b.data));
});

/** M19 US3 — mounted at /v1/listeners: GET /:id/likes?before= (public while that account's likes are). */
export const listenerLikes = new Hono<AuthEnv>();

listenerLikes.get('/:id/likes', optionalAuth, async (c) => {
  const id = c.req.param('id');
  if (!UUID.test(id)) throw new ApiError('not_found', 'No such listener.');
  const b = before.safeParse(c.req.query('before'));
  if (!b.success) throw new ApiError('validation', 'before must be an ISO time.', { fields: ['before'] });
  return c.json(await likesOf(c.get('db'), id, c.get('listener')?.id, b.data));
});

/**
 * M21 US7 (T081) — mounted at /v1/likes: the like post, OUR OWN DESIGN (owner, 2026-10-06).
 *   GET    /:ownerId/:episodeId                 → { like, comments, reactions }   (public while the like is)
 *   POST   /:ownerId/:episodeId/comments        { body ≤ 280 } → 201 the comment  (signed in)
 *   DELETE /:ownerId/:episodeId/comments/:id    → 204 (the author or the like's owner)
 *   PUT    /:ownerId/:episodeId/reactions       { emoji ≤ 16 } → 204              (one per listener)
 *   DELETE /:ownerId/:episodeId/reactions       → 204
 * A like the viewer may not see is 404 for every verb, so a block never shows as "blocked".
 */
export const likePosts = new Hono<AuthEnv>();

const ownerOf = (raw: string): string => {
  if (!UUID.test(raw)) throw new ApiError('not_found', 'No such like.');
  return raw;
};

async function mustSee(db: AuthEnv['Variables']['db'], ownerId: string, episodeId: string, viewerId: string): Promise<void> {
  if (!(await visibleLike(db, ownerId, episodeId, viewerId))) throw new ApiError('not_found', 'No such like.');
}

likePosts.get('/:ownerId/:episodeId', optionalAuth, async (c) => {
  const post = await likePost(c.get('db'), ownerOf(c.req.param('ownerId')), c.req.param('episodeId'), c.get('listener')?.id);
  if (!post) throw new ApiError('not_found', 'No such like.');
  return c.json(post);
});

likePosts.post('/:ownerId/:episodeId/comments', requireAuth, json(z.object({ body: z.string().trim().min(1).max(280) })), async (c) => {
  const ownerId = ownerOf(c.req.param('ownerId'));
  const episodeId = c.req.param('episodeId');
  const me = c.get('listener')!.id;
  await mustSee(c.get('db'), ownerId, episodeId, me);
  const made = await addLikeComment(c.get('db'), ownerId, episodeId, me, c.req.valid('json').body);
  // M22 US3 (FR-013): the like's owner is told (and pushed, US1); never for their own comment.
  await notify(c.get('db'), { recipientId: ownerId, actorId: me, kind: 'like_post_comment', ref: { ownerId, episodeId, likeCommentId: made.id, excerpt: made.body.slice(0, 120) } });
  return c.json(made, 201);
});

likePosts.delete('/:ownerId/:episodeId/comments/:commentId', requireAuth, async (c) => {
  const commentId = c.req.param('commentId');
  if (!UUID.test(commentId)) throw new ApiError('not_found', 'No such comment.');
  const done = await deleteLikeComment(c.get('db'), ownerOf(c.req.param('ownerId')), c.req.param('episodeId'), commentId, c.get('listener')!.id);
  if (!done) throw new ApiError('not_found', 'No such comment.');
  return c.body(null, 204);
});

likePosts.put('/:ownerId/:episodeId/reactions', requireAuth, json(z.object({ emoji: z.string().trim().min(1).max(16) })), async (c) => {
  const ownerId = ownerOf(c.req.param('ownerId'));
  const episodeId = c.req.param('episodeId');
  const me = c.get('listener')!.id;
  await mustSee(c.get('db'), ownerId, episodeId, me);
  await setLikeReaction(c.get('db'), ownerId, episodeId, me, c.req.valid('json').emoji);
  // M22 US3 (FR-013): one notice per listener per like-post — notify() skips a repeat (same ref).
  await notify(c.get('db'), { recipientId: ownerId, actorId: me, kind: 'like_post_like', ref: { ownerId, episodeId } });
  return c.body(null, 204);
});

likePosts.delete('/:ownerId/:episodeId/reactions', requireAuth, async (c) => {
  await clearLikeReaction(c.get('db'), ownerOf(c.req.param('ownerId')), c.req.param('episodeId'), c.get('listener')!.id);
  return c.body(null, 204);
});
