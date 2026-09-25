import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { recordEvents } from '../db/repos/rec-events.ts';

/**
 * Mounted at /v1/me/rec-events (M8 US6, research R9).
 *
 * This is how a channel earns its place. Without it the only way to judge the ordering is
 * whether it looks right, which is the thing this milestone is most at risk of doing.
 */
const event = z.object({
  episodeId: z.string().min(1).max(64),
  channel: z.enum(['sub-new', 'showcf', 'social', 'genre', 'talked', 'pick', 'chart']),
  rank: z.number().int().min(0).max(100),
  kind: z.enum(['impression', 'open', 'play', 'finish']),
  at: z.string().datetime(),
});

export const recEvents = new Hono<AuthEnv>();

recEvents.post('/', requireAuth, json(z.object({ events: z.array(event).max(200) })), async (c) => {
  await recordEvents(c.get('db'), c.get('listener')!.id, c.req.valid('json').events);
  return c.body(null, 204);
});
