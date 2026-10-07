// Listened-time routes: a device replaces its listened ranges per day; my minutes per day or month.
import { Hono } from 'hono';
import { z } from 'zod';
import { listening as listeningOf, listeningStickerDays } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { listenedRowsFor, replaceRanges } from '../../db/repos/library/listened.ts';

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

const DAY_MS = 86_400_000;

/** The phone's own date when it is within a day of the server's (time zones); otherwise the server's UTC date. */
export function todayFor(asked: string | undefined, now: number): string {
  const server = new Date(now).toISOString().slice(0, 10);
  if (!asked || !/^\d{4}-\d{2}-\d{2}$/.test(asked)) return server;
  const t = Date.parse(`${asked}T00:00:00Z`);
  return Number.isFinite(t) && Math.abs(t - Date.parse(`${server}T00:00:00Z`)) <= DAY_MS ? asked : server;
}

/**
 * M21 US9 — mounted at /v1/me/listening. GET ?range=30d|all[&today=YYYY-MM-DD] →
 * `{ range, days: {day, minutes}[], totalMinutes, topShows: {feedUrl, title, minutes}[≤5], earned }`.
 * `days` is 30 zero-filled days for 30d, one point per month (`YYYY-MM`) for all. `earned` maps an
 * hours sticker to the day the running total reached it. Only ever your own listening, so
 * `private_listening` (which hides it from others) does not apply.
 */
export const listeningRoute = new Hono<AuthEnv>();

listeningRoute.get('/', requireAuth, async (c) => {
  const asked = c.req.query('range') ?? '30d';
  if (asked !== '30d' && asked !== 'all') throw new ApiError('validation', 'range is 30d or all.', { fields: ['range'] });
  const range = asked === 'all' ? 'all' as const : '30d' as const;
  const rows = await listenedRowsFor(c.get('db'), c.get('listener')!.id);
  const today = todayFor(c.req.query('today'), Date.now());
  return c.json({ range, ...listeningOf(rows, today, range), earned: listeningStickerDays(rows) });
});

const historyBody = z.union([
  z.object({ episodeIds: z.array(z.string().min(1).max(64)).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

/**
 * M22 US8 (research R7) — mounted at /v1/me/history. DELETE `{ episodeIds: 1–100 }` or
 * `{ all: true }` → 204. Removes the listener's `positions` rows only: `listened_ranges` (and so
 * listening totals and hours stickers) stay as they were (guard G-M22-14). Another phone sees the
 * delete on its next position pull: a synced row the account no longer has is hidden there.
 */
export const history = new Hono<AuthEnv>();

history.delete('/', requireAuth, json(historyBody), async (c) => {
  const b = c.req.valid('json');
  const id = c.get('listener')!.id;
  if ('all' in b) await c.get('db').query('DELETE FROM positions WHERE listener_id = $1', [id]);
  else await c.get('db').query('DELETE FROM positions WHERE listener_id = $1 AND episode_id = ANY($2::text[])', [id, b.episodeIds]);
  if ('all' in b) await c.get('db').query('DELETE FROM listened_ranges WHERE listener_id = $1', [id]);
  else await c.get('db').query('DELETE FROM listened_ranges WHERE listener_id = $1 AND episode_id = ANY($2::text[])', [id, b.episodeIds]);
  return c.body(null, 204);
});
