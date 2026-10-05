// Discover route: the public Discover page plus the full talked-about chart.
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import type { AuthEnv } from '../../auth/session.ts';
import { CHART_MAX, discoverBody, SHOWS_SERVED, talkedAboutChart } from '../../db/repos/discover/discover.ts';
import { collectionsWithoutHidden, followedHere, newArrivals, resolveCollections, said, statsFor, videoEpisodes, withStats, type Collection, type FollowedHere, type NewArrival, type Said } from '../../db/repos/discover/discover-extras.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';
import { ApiError } from '../../errors.ts';
import type { DiscoverItem } from '../../db/repos/discover/discover.ts';
import { getDiscoverSettings, hasLayout } from '../../db/repos/discover/discover-settings.ts';
import { episodeFor } from './issues.ts';

/** Mounted at /v1/discover — public; ETag/304; `stale` when the catalogue could not be refreshed. */
export const discover = new Hono<AuthEnv>();

/** M10: an addition that fails is left out with a warning; the M5 fields never depend on it (principle IV). */
async function optional<T>(name: string, warnings: string[], f: () => Promise<T>): Promise<T | undefined> {
  try { return await f(); } catch (e) { warnings.push(`${name}: ${e instanceof Error ? e.message : String(e)}`); return undefined; }
}

discover.get('/', async (c) => {
  const cat = c.get('catalog');
  const db = c.get('db');
  const { body, stale } = await discoverBody(db, cat.fetch, cat.picks, cat.today());
  const { warnings, ...pub } = body;
  const extraWarnings: string[] = [];
  const hidden = await hiddenFeedUrls(db);
  const resolved = await optional('collections', extraWarnings, () => resolveCollections(db, cat.fetch, cat.collections));
  if (resolved) extraWarnings.push(...resolved.warnings);
  let collections: Collection[] | undefined = resolved ? collectionsWithoutHidden(resolved.collections, hidden) : undefined;
  const followed: FollowedHere | undefined = await optional('followedHere', extraWarnings, () => followedHere(db));
  const saidList: Said[] | undefined = await optional('said', extraWarnings, () => said(db));
  const video = await optional('video', extraWarnings, () => videoEpisodes(db));
  const arrivals: NewArrival[] | undefined = await optional('newArrivals', extraWarnings, () => newArrivals(db));
  const ids = [...pub.picks, ...(collections ?? []).flatMap((x) => x.items)].map((i) => i.episode.id);
  const stats = await optional('stats', extraWarnings, () => statsFor(db, ids));
  const picks = stats ? withStats(pub.picks, stats) : pub.picks;
  if (stats && collections) collections = collections.map((x) => ({ ...x, items: withStats(x.items, stats) }));
  const shows = pub.shows?.slice(0, SHOWS_SERVED);
  // Owner, 2026-10-05: "Premium picks" — the chart's next six. No price, nothing sold (constitution 2.1.0).
  const premium = pub.shows?.slice(SHOWS_SERVED, SHOWS_SERVED * 2);
  // M15 T034 (FR-026–FR-029): the owner's Discover settings, at serve time. Unreadable → today's Discover, no `layout`.
  const settings = await optional('discoverSettings', extraWarnings, async () => ({ s: await getDiscoverSettings(db), saved: await hasLayout(db) }));
  let trending: DiscoverItem[] = pub.trending;
  if (settings) {
    const hideKeys = new Set(settings.s.hides.map((h) => `${h.feedUrl}\u0001${h.guid}`));
    const pinned: DiscoverItem[] = [];
    for (const p of settings.s.pins) {
      if (hidden.has(p.feedUrl)) continue;
      const ep = await episodeFor(db, p.feedUrl, p.guid);
      if (ep) pinned.push({ kind: 'trending', key: `${ep.feedUrl}\u0001${ep.guid}`, episode: ep, reason: 'Picked by the editors' });
    }
    const pinKeys = new Set(pinned.map((i) => i.key));
    trending = [...pinned, ...pub.trending.filter((t) => !pinKeys.has(t.key) && !hideKeys.has(t.key))];
  }
  const layout = settings?.saved ? { order: settings.s.order, hidden: settings.s.hidden } : undefined;

  const etag = `W/"${createHash('sha256').update(JSON.stringify([
    body.date, body.picks.map((p) => p.key), body.talkedAbout.map((p) => p.key), trending.map((p) => p.key),
    // M15: the layout and the pins/hides (already in `trending`) are in the hash too.
    layout ?? null,
    // M10: every new list is in the hash, so a change in any of them is a 200, not a 304.
    shows?.map((s) => s.feedUrl), pub.newShows?.map((n) => n.episode.id),
    followed ? [followed.total, followed.shows.map((s) => [s.feedUrl, s.followers, s.title])] : null,
    saidList?.map((s) => s.commentId), collections?.map((x) => [x.id, x.title, x.subtitle, x.items.map((i) => i.key)]),
    picks.map((p) => p.stats ?? null), collections?.map((x) => x.items.map((i) => i.stats ?? null)),
    video?.map((v) => v.episode.id),
    premium?.map((s) => s.feedUrl), arrivals?.map((a) => a.episode.id),
  ])).digest('base64url').slice(0, 16)}"`;
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  c.header('ETag', etag);
  const all = [...warnings, ...extraWarnings];
  if (all.length > 0) console.warn(`[discover] ${all.join(' | ')}`);
  return c.json({
    ...pub, picks, trending,
    ...(layout ? { layout } : {}),
    ...(shows ? { shows } : {}),
    ...(followed ? { followedHere: followed } : {}),
    ...(saidList ? { said: saidList } : {}),
    ...(collections ? { collections } : {}),
    ...(video && video.length > 0 ? { video } : {}),
    ...(premium ? { premium } : {}),
    ...(arrivals ? { newArrivals: arrivals } : {}),
    stale, serverTime: new Date().toISOString(),
  });
});

/** M12 FR-071 — GET /v1/discover/chart?limit=1..100 (default 100): the full "Talked about" ranking. Counts only, never names (G6). */
discover.get('/chart', async (c) => {
  const raw = c.req.query('limit');
  const limit = raw === undefined ? CHART_MAX : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > CHART_MAX) throw new ApiError('validation', `limit must be 1–${CHART_MAX}.`, { fields: ['limit'] });
  const items = await talkedAboutChart(c.get('db'), limit);
  c.header('cache-control', 'public, max-age=300');
  return c.json({ items, serverTime: new Date().toISOString() });
});
