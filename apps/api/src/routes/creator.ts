import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { createClaim, isProvenOwner, myClaims, showStats, verifyClaim } from '../db/repos/creator.ts';

/** Mounted at /v1/creator (M10b US8). Every route needs an account; stats need a proven claim (403 otherwise). */
export const creator = new Hono<AuthEnv>();

creator.get('/claims', requireAuth, async (c) => c.json({ claims: await myClaims(c.get('db'), c.get('listener')!.id) }));

creator.post('/claims', requireAuth, json(z.object({ feedUrl: z.string().url().max(2048) })), async (c) => {
  const claim = await createClaim(c.get('db'), c.get('listener')!.id, c.req.valid('json').feedUrl);
  return c.json(claim);
});

creator.post('/claims/:id/verify', requireAuth, async (c) => {
  const r = await verifyClaim(c.get('db'), c.get('catalog').fetch, c.get('listener')!.id, c.req.param('id')).catch(() => ({ status: 'pending' as const }));
  if (r === 'not_found') return c.json({ error: 'not_found', message: 'No such claim.' }, 404);
  if (r === 'taken') return c.json({ error: 'conflict', message: 'Someone else has already proven this show.' }, 409);
  return c.json(r);
});

creator.get('/shows/stats', requireAuth, async (c) => {
  const feedUrl = c.req.query('feedUrl') ?? '';
  if (!(await isProvenOwner(c.get('db'), c.get('listener')!.id, feedUrl))) return c.json({ error: 'forbidden', message: 'Claim this show first.' }, 403);
  return c.json(await showStats(c.get('db'), feedUrl));
});
