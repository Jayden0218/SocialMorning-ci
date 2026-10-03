import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { getEpisode } from '../../db/repos/library/episodes.ts';
import { heartbeat, listeningNow } from '../../db/repos/social/live-listeners.ts';

/**
 * M12 FR-042 — mounted at /v1/episodes. A separate pair of routes, NOT a field of the social
 * poll: the poll is ETag-cached and a count that moves every minute would turn every 304
 * into a 200. No auth: the count is of installs, never of accounts (guard G-L1).
 */
export const live = new Hono<AuthEnv>();

const body = z.object({ installId: z.string().min(8).max(128) });

live.put('/:id/live', json(body), async (c) => {
  const db = c.get('db');
  const episodeId = c.req.param('id');
  if (!(await getEpisode(db, episodeId))) throw new ApiError('not_found', 'No such episode here yet.');
  await heartbeat(db, episodeId, c.req.valid('json').installId, c.get('pepper'));
  return c.body(null, 204);
});

live.get('/:id/live', async (c) => {
  c.header('cache-control', 'no-store');
  return c.json({ listeningNow: await listeningNow(c.get('db'), c.req.param('id')) });
});
