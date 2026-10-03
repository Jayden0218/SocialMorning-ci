/**
 * Studio API (`/v1/studio/*`) — US2: Data
 */
import { ApiError } from '../../errors.ts';
import { EPISODE_SORTS, alsoFollow, episodeCsv, episodeDetail, episodeStats, sortEpisodes, trend, trendCsv, validTz, yesterday, type EpisodeSort } from '../../db/repos/studio-numbers.ts';
import type { Hono } from 'hono';
import { days, metric } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerData(studio: Hono<StudioEnv>): void {
  const csv = (body: string, filename: string) =>
    new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    });

  const slug = (s: string | null) => (s ?? 'show').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'show';

  studio.get('/shows/:show/yesterday', async (c) => c.json(await yesterday(c.get('db'), c.get('show').feedUrl, validTz(c.req.query('tz')))));

  studio.get('/shows/:show/top-episodes', async (c) => {
    const all = sortEpisodes(await episodeStats(c.get('db'), c.get('show').feedUrl), 'plays', 'desc');
    return c.json({ items: all.filter((e) => e.plays > 0).slice(0, 5).map((e) => ({ id: e.id, title: e.title, plays: e.plays })) });
  });

  studio.get('/shows/:show/also-follow', async (c) => c.json(await alsoFollow(c.get('db'), c.get('show').feedUrl)));

  studio.get('/shows/:show/episodes', async (c) => {
    const q = (c.req.query('q') ?? '').trim().toLowerCase();
    const sort = (EPISODE_SORTS as readonly string[]).includes(c.req.query('sort') ?? '') ? (c.req.query('sort') as EpisodeSort) : 'publishedAt';
    const dir = c.req.query('dir') === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
    const all = sortEpisodes((await episodeStats(c.get('db'), c.get('show').feedUrl)).filter((e) => !q || e.title.toLowerCase().includes(q)), sort, dir);
    return c.json({ total: all.length, page, pageSize: 20, items: all.slice((page - 1) * 20, page * 20) });
  });

  studio.get('/shows/:show/episodes/:id', async (c) => {
    const d = await episodeDetail(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
    if (!d) throw new ApiError('not_found', 'No such episode on this show.');
    return c.json(d);
  });

  studio.get('/shows/:show/export/trend.csv', async (c) => {
    const m = metric(c.req.query('metric'));
    const n = days(c.req.query('days'));
    const rows = await trend(c.get('db'), c.get('show').feedUrl, m, n, validTz(c.req.query('tz')));
    return csv(trendCsv(m, rows), `${slug(c.get('show').title)}-${m}-${n}d.csv`);
  });

  studio.get('/shows/:show/export/episodes.csv', async (c) => {
    const all = sortEpisodes(await episodeStats(c.get('db'), c.get('show').feedUrl), 'publishedAt', 'desc');
    return csv(episodeCsv(all), `${slug(c.get('show').title)}-episodes.csv`);
  });
}
