/**
 * Admin API (`/v1/admin/*`, owner only) — US2: picks
 */
import { z } from 'zod';
import { adminWrite, auditCtx } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { adminPickDays, checkPickItems, getPickDay, pickWarning, putPickDay, type PickItemRow } from '../../db/repos/admin/admin-picks.ts';
import { discoverBody } from '../../db/repos/discover/discover.ts';
import { episodeFor } from '../discover/issues.ts';
import type { Hono } from 'hono';
import { validDay, dayParam, addDays, feedUrl, guid, version, catalogChanged, target } from './common.ts';
import type { AdminEnv } from '../../auth/admin.ts';

export function registerPicks(admin: Hono<AdminEnv>): void {
  admin.get('/picks', async (c) => {
    const today = c.get('catalog').today();
    const from = c.req.query('from') ?? `${today.slice(0, 7)}-01`;
    const to = c.req.query('to') ?? addDays(from, 41);
    if (!validDay(from) || !validDay(to) || to < from || addDays(from, 62) < to) throw new ApiError('validation', 'from/to must be YYYY-MM-DD, at most 62 days apart.', { fields: ['from', 'to'] });
    const adminDays = await adminPickDays(c.get('db'), from, to);
    const taken = new Set(adminDays.map((d) => d.day));
    const fileCounts = new Map<string, number>();
    for (const p of c.get('catalog').picks) {
      if (p.date < from || p.date > to || taken.has(p.date)) continue;
      fileCounts.set(p.date, Math.min(5, (fileCounts.get(p.date) ?? 0) + 1));
    }
    const days = [
      ...adminDays.map((d) => ({ day: d.day, count: d.count, source: 'admin' as const })),
      ...[...fileCounts].map(([day, count]) => ({ day, count, source: 'file' as const })),
    ].sort((a, b) => a.day.localeCompare(b.day));
    return c.json({ today, days });
  });

  admin.get('/picks/:day', async (c) => {
    const day = dayParam(c.req.param('day'));
    const db = c.get('db');
    const row = await getPickDay(db, day);
    // A day the tables do not have shows the file's picks for that date, to start from (version 0).
    const items: PickItemRow[] = row?.items ?? c.get('catalog').picks.filter((p) => p.date === day)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, 5).map((p) => ({ feedUrl: p.feedUrl, ...(p.guid ? { guid: p.guid } : {}), why: p.why }));
    const withEpisodes = [];
    for (const it of items) withEpisodes.push({ ...it, episode: await episodeFor(db, it.feedUrl, it.guid) });
    return c.json({ day, version: row?.version ?? 0, source: row ? 'admin' : items.length > 0 ? 'file' : 'none', items: withEpisodes });
  });

  const picksBody = z.object({
    version,
    items: z.array(z.object({ feedUrl, guid, why: z.string().trim().min(1).max(140) })).max(5),
  });

  admin.put('/picks/:day', json(picksBody), async (c) => {
    const day = dayParam(c.req.param('day'));
    const db = c.get('db');
    const b = c.req.valid('json');
    const clean = checkPickItems(day, b.items);
    const f = c.get('catalog').fetch;
    const items: PickItemRow[] = [];
    for (const it of clean) {
      const warning = await pickWarning(db, f, it.feedUrl, it.guid);
      items.push(warning ? { ...it, warning } : it);
    }
    const next = await adminWrite(db, auditCtx(c), { area: 'picks', action: items.length === 0 ? 'clear' : 'save', target: day },
      async (tx) => (await getPickDay(tx, day)) ?? null,
      (tx) => putPickDay(tx, day, b.version, items, c.get('listener')!.id));
    await catalogChanged(db);
    return c.json({ day, version: next, warnings: items.flatMap((i) => (i.warning ? [`${i.feedUrl}${i.guid ? ` ${i.guid}` : ''}: ${i.warning}`] : [])) });
  });

  admin.get('/preview/discover', async (c) => {
    const cat = c.get('catalog');
    const day = c.req.query('day') ?? cat.today();
    dayParam(day);
    const { body, stale } = await discoverBody(c.get('db'), cat.fetch, cat.picks, day);
    return c.json({ ...body, stale });
  });
}
