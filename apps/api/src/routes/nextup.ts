import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { optionalAuth } from '../auth/session.ts';
import { ApiError } from '../errors.ts';
import { nextUpFor } from '../db/repos/nextup.ts';

/** Mounted at /v1/episodes — GET /:id/next-up (optional auth: the viewer's finished episodes are excluded). */
export const nextup = new Hono<AuthEnv>();

nextup.get('/:id/next-up', optionalAuth, async (c) => {
  const items = await nextUpFor(c.get('db'), c.get('catalog').fetch, c.req.param('id'), c.get('listener')?.id);
  if (items === undefined) throw new ApiError('not_found', 'Register the episode first (PUT /v1/episodes/:id).');
  return c.json({ items, computedAt: new Date().toISOString() });
});
