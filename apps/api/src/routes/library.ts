import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { KINDS, listAll, merge, myComments, toPublic } from '../db/repos/library.ts';

/**
 * Mounted at /v1/me/library and /v1/me/comments (M10b US2). Private: there is no route
 * that takes another listener's id (guard G-P1).
 */
const item = z.object({
  kind: z.enum(KINDS),
  key: z.string().min(1).max(512),
  payload: z.record(z.string(), z.unknown()).optional(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable().optional(),
});
const putBody = z.object({ items: z.array(item).max(2000) });

export const library = new Hono<AuthEnv>();

library.get('/', requireAuth, async (c) => {
  const rows = await listAll(c.get('db'), c.get('listener')!.id);
  return c.json({ items: rows.map(toPublic), serverTime: new Date().toISOString() });
});

library.put('/', requireAuth, json(putBody), async (c) => {
  const rows = await merge(c.get('db'), c.get('listener')!.id, c.req.valid('json').items);
  return c.json({ items: rows.map(toPublic), serverTime: new Date().toISOString() });
});

export const myCommentsRoute = new Hono<AuthEnv>();

myCommentsRoute.get('/', requireAuth, async (c) => {
  const before = c.req.query('before');
  const ok = before === undefined || !Number.isNaN(Date.parse(before));
  if (!ok) return c.json({ error: 'validation', message: 'before must be a date' }, 400);
  return c.json(await myComments(c.get('db'), c.get('listener')!.id, before));
});
