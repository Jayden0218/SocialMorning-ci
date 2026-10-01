/**
 * M15 T020 — the public launch-screen routes the phone reads (contracts/admin-api.md "Public").
 *
 *   GET  /v1/launch             live promotions only, `public, max-age=300`
 *   POST /v1/launch/:id/events  { kind: impression | tap } → +1 to a total, 204
 *
 * No sign-in, and nothing about the person is stored (FR-017, guard G-L2): the throttle below
 * lives in memory only, keyed by a hash, and is forgotten after a minute.
 */
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { json } from '../validate.ts';
import { countEvent, livePromotions } from '../db/repos/promotions.ts';

export const LAUNCH_EVENTS_PER_MINUTE = 20;

/** One router per app so the throttle is the app's, not the module's (a test process builds many apps). */
export function createLaunchRoute() {
  const launch = new Hono<AuthEnv>();
  const recent = new Map<string, number[]>();
  const throttled = (key: string, now: number): boolean => {
    const hits = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
    hits.push(now);
    recent.set(key, hits);
    if (recent.size > 10_000) for (const [k, v] of recent) if (v.every((t) => now - t >= 60_000)) recent.delete(k);
    return hits.length > LAUNCH_EVENTS_PER_MINUTE;
  };

  launch.get('/', async (c) => {
    const items = await livePromotions(c.get('db'));
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({
      items: items.map((p) => ({ id: p.id, imageUrl: p.imageUrl, targetKind: p.targetKind, target: p.target, label: p.label, startsAt: p.startsAt, endsAt: p.endsAt, weight: p.weight, dailyCap: p.dailyCap })),
    });
  });

  launch.post('/:id/events', json(z.object({ kind: z.enum(['impression', 'tap']) })), async (c) => {
    const who = createHash('sha256').update(c.req.header('x-forwarded-for') ?? 'anon').digest('base64url').slice(0, 16);
    if (throttled(who, Date.now())) return c.body(null, 204); // a burst is not real views; drop quietly
    await countEvent(c.get('db'), c.req.param('id'), c.req.valid('json').kind);
    return c.body(null, 204);
  });

  return launch;
}
