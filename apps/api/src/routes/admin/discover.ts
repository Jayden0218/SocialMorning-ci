// Admin routes for Discover layout and featured shows per category.
/**
 * Admin API (`/v1/admin/*`, owner only) — US5: Discover control
 */
import { z } from 'zod';
import { adminWrite, auditCtx } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { getDiscoverSettings, getFeatures, MAX_FEATURES, MAX_PINS, putDiscoverSettings, putFeatures, SECTION_IDS } from '../../db/repos/discover/discover-settings.ts';
import { genreName } from '../../catalog/genres.ts';
import type { Hono } from 'hono';
import { feedUrl, guid, version, target } from './common.ts';
import type { AdminEnv } from '../../auth/admin.ts';

export function registerDiscover(admin: Hono<AdminEnv>): void {
  const ref = z.object({ feedUrl, guid });

  const discoverBody_ = z.object({
    version,
    order: z.array(z.string().max(40)).max(20),
    hidden: z.array(z.string().max(40)).max(20),
    pins: z.array(ref).max(MAX_PINS),
    hides: z.array(z.object({ feedUrl, guid: z.string().trim().min(1).max(1024) })).max(200),
  });

  admin.get('/discover', async (c) => c.json({ sections: SECTION_IDS, ...(await getDiscoverSettings(c.get('db'))) }));

  admin.put('/discover', json(discoverBody_), async (c) => {
    const b = c.req.valid('json');
    const db = c.get('db');
    const pins = b.pins.map((p) => ({ feedUrl: p.feedUrl, ...(p.guid ? { guid: p.guid } : {}) }));
    const next = await adminWrite(db, auditCtx(c), { area: 'discover', action: 'save', target: 'discover' },
      (tx) => getDiscoverSettings(tx), (tx) => putDiscoverSettings(tx, { version: b.version, order: b.order, hidden: b.hidden, pins, hides: b.hides }));
    return c.json({ version: next });
  });

  const genreParam = (raw: string): number => {
    const g = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
    if (Number.isNaN(g) || genreName(g) === undefined) throw new ApiError('not_found', 'No such category.');
    return g;
  };

  admin.get('/categories/:genreId/features', async (c) => {
    const g = genreParam(c.req.param('genreId'));
    return c.json({ genreId: g, shows: (await getFeatures(c.get('db'), g)).map((f) => ({ feedUrl: f })) });
  });

  admin.put('/categories/:genreId/features', json(z.object({ shows: z.array(z.object({ feedUrl })).max(MAX_FEATURES) })), async (c) => {
    const g = genreParam(c.req.param('genreId'));
    const shows = c.req.valid('json').shows.map((s) => s.feedUrl);
    await adminWrite(c.get('db'), auditCtx(c), { area: 'discover', action: 'features', target: `genre:${g}` },
      async (tx) => ({ shows: await getFeatures(tx, g) }), (tx) => putFeatures(tx, g, shows));
    return c.json({ genreId: g, shows: shows.map((f) => ({ feedUrl: f })) });
  });
}
