// Studio routes to claim a show and verify the claim.
/**
 * Studio API (`/v1/studio/*`) — Claiming a show from the Studio
 */
import { ApiError } from '../../errors.ts';
import { showsFor } from '../../db/repos/studio/studio-roles.ts';
import { z } from 'zod';
import { json } from '../../validate.ts';
import { createClaim, myClaims, verifyClaim } from '../../db/repos/studio/creator.ts';
import type { Hono } from 'hono';
import { https } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerClaims(studio: Hono<StudioEnv>): void {
  // A person with no show lands here first. Ownership is still proven the same way: the code must
  // appear in the live feed (M10b guard G-C1), so nobody reaches another creator's data by asking.

  studio.get('/claims', async (c) => c.json({ claims: await myClaims(c.get('db'), c.get('listener')!.id) }));

  studio.post('/claims', json(z.object({ feedUrl: z.string().trim().url().max(2048).regex(/^https?:\/\//) })), async (c) =>
    c.json({ claim: await createClaim(c.get('db'), c.get('listener')!.id, c.req.valid('json').feedUrl) }, 201));

  studio.post('/claims/:id/verify', async (c) => {
    const db = c.get('db');
    const me = c.get('listener')!;
    const r = await verifyClaim(db, c.get('catalog').fetch, me.id, c.req.param('id')).catch(() => ({ status: 'pending' as const }));
    if (r === 'not_found') throw new ApiError('not_found', 'No such claim.');
    if (r === 'taken') throw new ApiError('conflict', 'Someone else has already proved this show is theirs.');
    return c.json({ status: r.status, shows: await showsFor(db, me.id) });
  });
}
