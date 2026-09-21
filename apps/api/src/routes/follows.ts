import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { ApiError } from '../errors.ts';
import { follow, followers, following, unfollow } from '../db/repos/follows.ts';

/** Mounted at /v1/listeners — PUT/DELETE /:id/follow, GET /:id/followers, GET /:id/following. */
export const follows = new Hono<AuthEnv>();

follows.put('/:id/follow', requireAuth, async (c) => {
  const recent = await c.get('db').query<{ n: number }>(`SELECT count(*)::int AS n FROM follows WHERE follower_id = $1 AND created_at > now() - interval '1 minute'`, [c.get('listener')!.id]);
  if (Number(recent[0]?.n ?? 0) >= 60) throw new ApiError('locked', 'Too many follows in a minute.', { retryAfterSeconds: 60 });
  const r = await follow(c.get('db'), c.get('listener')!.id, c.req.param('id'));
  if (r === 'self') throw new ApiError('self_follow', "You can't follow yourself.");
  if (r === 'no_such_listener') throw new ApiError('not_found', 'No such listener.');
  return c.body(null, 204);
});

follows.delete('/:id/follow', requireAuth, async (c) => {
  await unfollow(c.get('db'), c.get('listener')!.id, c.req.param('id'));
  return c.body(null, 204);
});

follows.get('/:id/followers', async (c) => c.json(await followers(c.get('db'), c.req.param('id'), c.req.query('before') || undefined)));
follows.get('/:id/following', async (c) => c.json(await following(c.get('db'), c.req.param('id'), c.req.query('before') || undefined)));
