// Studio overview routes: a show's totals and trend over time.
/**
 * Studio API (`/v1/studio/*`) — Overview and trend
 */
import { METRICS, claimedAt, recentComments, recentEpisodes, totals, trend, validTz } from '../../db/repos/studio/studio-numbers.ts';
import { hostedByFeed, promoteDue } from '../../db/repos/studio/hosted.ts';
import type { Hono } from 'hono';
import { days, metric } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerOverview(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/overview', async (c) => {
    const db = c.get('db');
    const { feedUrl } = c.get('show');
    const tz = validTz(c.req.query('tz'));
    const hosted = await hostedByFeed(db, feedUrl);
    if (hosted) await promoteDue(db, hosted);
    const [t, comments, episodes, since, ...sparks] = await Promise.all([
      totals(db, feedUrl), recentComments(db, feedUrl), recentEpisodes(db, feedUrl), claimedAt(db, feedUrl),
      ...METRICS.map((m) => trend(db, feedUrl, m, 14, tz)),
    ]);
    // M14 US6 (FR-07): 14 daily points per stat, from the same query as the trend.
    const sparkline = Object.fromEntries(METRICS.map((m, i) => [m, (sparks[i] as { value: number }[]).map((d) => d.value)]));
    return c.json({ show: c.get('show'), claimedAt: since, totals: t, recentComments: comments, recentEpisodes: episodes, sparklines: sparkline });
  });

  studio.get('/shows/:show/trend', async (c) => {
    const m = metric(c.req.query('metric'));
    const n = days(c.req.query('days'));
    const tz = validTz(c.req.query('tz'));
    return c.json({ metric: m, tz, days: await trend(c.get('db'), c.get('show').feedUrl, m, n, tz) });
  });
}
