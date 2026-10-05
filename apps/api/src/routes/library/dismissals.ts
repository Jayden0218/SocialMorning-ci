// "Not interested" routes: list, add and restore the episodes and shows For You must skip.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { addDismissal, listDismissals, removeDismissal } from '../../db/repos/discover/dismissals.ts';

/** M19 US2 — mounted at /v1/me/dismissals: GET, PUT { kind, itemKey }, DELETE { kind, itemKey }. */
export const dismissals = new Hono<AuthEnv>();

const body = z.object({ kind: z.enum(['episode', 'show']), itemKey: z.string().min(1).max(2048) });

dismissals.get('/', requireAuth, async (c) => c.json({ items: await listDismissals(c.get('db'), c.get('listener')!.id) }));

dismissals.put('/', requireAuth, json(body), async (c) => {
  const b = c.req.valid('json');
  await addDismissal(c.get('db'), c.get('listener')!.id, b.kind, b.itemKey);
  return c.body(null, 204);
});

dismissals.delete('/', requireAuth, json(body), async (c) => {
  const b = c.req.valid('json');
  await removeDismissal(c.get('db'), c.get('listener')!.id, b.kind, b.itemKey);
  return c.body(null, 204);
});
