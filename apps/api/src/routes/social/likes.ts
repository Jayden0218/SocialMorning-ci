// Like routes: like an episode with a note, unlike, my timeline, one account's likes.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth, requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { like, likesOf, myLike, timeline, unlike } from '../../db/repos/social/likes.ts';

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
