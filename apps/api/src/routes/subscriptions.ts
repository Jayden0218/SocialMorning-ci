import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { listAll, merge, toPublic } from '../db/repos/subscriptions.ts';

/**
 * Mounted at /v1/me/subscriptions (M8 US1). Private to the listener: FR-004 says no
 * endpoint may disclose what anybody else subscribes to, and there is no route here that
 * takes another listener's id.
 */
const item = z.object({
  feedUrl: z.string().url().max(2048),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
  starred: z.boolean().optional(),
});
const putBody = z.object({ items: z.array(item).max(1000) });

export const subscriptions = new Hono<AuthEnv>();

subscriptions.get('/', requireAuth, async (c) => {
  const rows = await listAll(c.get('db'), c.get('listener')!.id);
  return c.json({ items: rows.map(toPublic), serverTime: new Date().toISOString() });
});

/**
 * Full-set merge. The response is the account's WHOLE set including tombstones, so the
 * phone can replace its table wholesale and converge in one round trip (FR-002).
 */
subscriptions.put('/', requireAuth, json(putBody), async (c) => {
  const rows = await merge(c.get('db'), c.get('listener')!.id, c.req.valid('json').items);
  return c.json({ items: rows.map(toPublic), serverTime: new Date().toISOString() });
});
