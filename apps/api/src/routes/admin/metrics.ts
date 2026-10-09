// Admin dashboard route: usage numbers for 7, 30 or 90 days, cached five minutes.
/**
 * Admin API (`/v1/admin/*`, owner only) — M18: the dashboard
 */
import { ApiError } from '../../errors.ts';
import { cached } from '../../db/repos/cache.ts';
import { computeMetrics, dropCachedMetrics, METRIC_RANGES, type MetricRange } from '../../db/repos/admin/metrics.ts';
import type { Hono } from 'hono';
import type { AdminEnv } from '../../auth/admin.ts';

/** Numbers at most 5 minutes old (D2). A result with a failed section is served once, never kept (R5). */
export const METRICS_TTL_MS = 5 * 60_000;

export function registerMetrics(admin: Hono<AdminEnv>): void {
  admin.get('/metrics', async (c) => {
    const raw = c.req.query('days') ?? '30';
    const days = Number(raw) as MetricRange;
    if (!METRIC_RANGES.includes(days)) throw new ApiError('validation', 'The range must be 7, 30 or 90 days.', { fields: ['days'] });
    const db = c.get('db');
    const key = `admin-metrics:${days}`;
    const { body } = await cached(db, key, METRICS_TTL_MS, () => computeMetrics(db, days));
    if (body.partial) await dropCachedMetrics(db, key);
    return c.json(body);
  });
}
