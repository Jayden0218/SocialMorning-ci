import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { replaceRanges } from '../db/repos/listened.ts';

const range = z.tuple([z.number().int().min(0), z.number().int().min(0)]).refine(([a, b]) => a < b, 'from < to');
const body = z.object({
  deviceId: z.string().min(1).max(64),
  days: z.array(z.object({
    episodeId: z.string().min(1).max(64),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ranges: z.array(range).max(500),
  })).max(200),
});

/** Mounted at /v1/me/listened — PUT replaces this device's ranges per (episode, day). */
export const listened = new Hono<AuthEnv>();

listened.put('/', requireAuth, json(body), async (c) => {
  const b = c.req.valid('json');
  const accepted = await replaceRanges(c.get('db'), c.get('listener')!.id, b.deviceId, b.days.map((d) => ({ episodeId: d.episodeId, day: d.day, ranges: d.ranges.map(([a, z2]) => [a, z2] as const) })));
  return c.json({ accepted });
});
