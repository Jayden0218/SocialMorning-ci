// Sticker placement routes: read my stickers on my profile header, or replace them all.
/**
 * M21 US9 (contracts/api.md), mounted at /v1/me/stickers.
 * GET /placements → { items: Placement[] } (mine, even while my decorations are hidden).
 * PUT /placements Body { items: {stickerId, x, y, scale, rot, z}[] ≤ 10 } → 204; 400 on a bound,
 * more than 10, an unknown or repeated sticker. "Earned" is NOT checked here — the phone works it out.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { checkPlacements, type Placement } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { placementsFor, replacePlacements } from '../../db/repos/account/stickers.ts';

const item = z.object({ stickerId: z.string().min(1).max(64), x: z.number(), y: z.number(), scale: z.number(), rot: z.number(), z: z.number() });
const body = z.object({ items: z.array(item) });

const SAYS: Record<string, string> = {
  too_many: 'At most 10 stickers.',
  unknown_sticker: 'No such sticker.',
  duplicate: 'Each sticker can be placed once.',
  out_of_bounds: 'A sticker is outside the header, too small, too big or turned too far.',
};

export const stickers = new Hono<AuthEnv>();

stickers.get('/placements', requireAuth, async (c) => c.json({ items: await placementsFor(c.get('db'), c.get('listener')!.id) }));

stickers.put('/placements', requireAuth, async (c) => {
  const parsed = body.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) throw new ApiError('validation', 'Send { items: [{ stickerId, x, y, scale, rot, z }] }.', { fields: ['items'] });
  const items: Placement[] = parsed.data.items;
  const check = checkPlacements(items);
  if (check !== 'ok') throw new ApiError('validation', SAYS[check] ?? 'Those stickers cannot be placed.', { reason: check, fields: ['items'] });
  await replacePlacements(c.get('db'), c.get('listener')!.id, items);
  return c.body(null, 204);
});
