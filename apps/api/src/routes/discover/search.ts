// Search routes: shows and episodes from Apple, and people by name, rate-limited.
import { Hono } from 'hono';
import { collapseByFeed, collapseEpisodes } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { cached, TTL } from '../../db/repos/cache.ts';
import { CatalogRateLimited, searchEpisodes, searchShows, type EpisodeCard, type ShowCard } from '../../catalog/apple.ts';
import { registerCard } from '../../catalog/feed.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';
import { hiddenEpisodeIds } from '../../db/repos/studio/hidden-episodes.ts';
import { statsFor } from '../../db/repos/discover/discover-extras.ts';
import { createdShowsMatching, peopleMatching } from '../../db/repos/discover/search-local.ts';

/** M21 T080: `since=30d|180d` keeps episodes published in that many days; one without a date is left out. */
export const SINCE_DAYS = { '30d': 30, '180d': 180 } as const;

/**
 * Mounted at /v1/search — public. Shows and episodes from Apple, both cached 10 min per
 * term; shows collapsed by feed; episodes registered as M3 episodes (with their ids).
 * Partial degradation (FR-007): the episode call failing alone → `episodeSearch:
 * 'unavailable'`; both failing → 503; Apple's 429 → 429 `locked` with a retry hint.
 * Apple allows ~20 searches a minute (M1's note): 10 per listener/IP per minute here.
 */
export const normaliseQuery = (q: string): string => q.trim().replace(/\s+/g, ' ');
export const isSearchable = (q: string): boolean => /[\p{L}\p{N}]/u.test(q);

/** One router per app so the throttle state is the app's, not the module's (a test process builds many apps). */
export function createSearchRoute() {
  const search = new Hono<AuthEnv>();
  const recent = new Map<string, number[]>();
  const throttled = (key: string, now: number, limit = 10, windowMs = 60_000): boolean => {
    const hits = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
    hits.push(now);
    recent.set(key, hits);
    return hits.length > limit;
  };

  search.get('/', optionalAuth, async (c) => {
  const q = normaliseQuery(c.req.query('q') ?? '');
  if (q.length < 1 || q.length > 100) throw new ApiError('validation', 'q must be 1–100 characters.', { fields: ['q'] });
  const sinceRaw = c.req.query('since');
  if (sinceRaw !== undefined && !(sinceRaw in SINCE_DAYS)) throw new ApiError('validation', 'since must be 30d or 180d.', { fields: ['since'] });
  const sinceMs = sinceRaw !== undefined ? Date.now() - SINCE_DAYS[sinceRaw as keyof typeof SINCE_DAYS] * 86_400_000 : undefined;
  if (!isSearchable(q)) return c.json({ shows: [], episodes: [], episodeSearch: 'ok', source: { shows: 'apple' } });
  const who = c.get('listener')?.id ?? c.req.header('x-forwarded-for') ?? 'anon';
  if (throttled(who, Date.now())) throw new ApiError('locked', 'Too many searches — try again in a moment.', { retryAfterSeconds: 30 });

  const db = c.get('db');
  const f = c.get('catalog').fetch;
  const key = q.toLowerCase();
  const [showsR, episodesR] = await Promise.allSettled([
    cached<ShowCard[]>(db, `apple:search:shows:${key}`, TTL.search, () => searchShows(f, q)),
    cached<EpisodeCard[]>(db, `apple:search:episodes:${key}`, TTL.search, () => searchEpisodes(f, q)),
  ]);
  // M13 (FR-010): shows created in the Studio are not in Apple's catalogue; they are found here first.
  const local = await createdShowsMatching(db, q.replace(/[\\%_]/g, (m) => '\\' + m));
  const created: ShowCard[] = local.map((r) => ({ feedUrl: r.feed_url, title: r.title, author: r.author, genres: [r.category], ...(r.cover_url ? { imageUrl: r.cover_url } : {}) }));
  const rateLimited = [showsR, episodesR].some((r) => r.status === 'rejected' && r.reason instanceof CatalogRateLimited);
  if (showsR.status === 'rejected' && episodesR.status === 'rejected' && created.length === 0) {
    if (rateLimited) throw new ApiError('locked', 'The catalogue is busy — try again in a moment.', { retryAfterSeconds: 30 });
    throw new ApiError('unavailable', 'The catalogue is not answering right now.');
  }
  const hidden = await hiddenFeedUrls(db); // M6 (FR-014): a hidden show is not found
  const hiddenEps = await hiddenEpisodeIds(db); // M24 US11: hidden episodes leave this list.
  const fromApple = showsR.status === 'fulfilled' ? collapseByFeed(showsR.value.body) : [];
  const shows = [...created, ...fromApple.filter((s) => !created.some((x) => x.feedUrl === s.feedUrl))].filter((s) => !hidden.has(s.feedUrl));
  const episodes: (EpisodeCard & { id: string; stats?: { listeners: number; comments: number } })[] = [];
  if (episodesR.status === 'fulfilled') {
    for (const e of collapseEpisodes(episodesR.value.body)) {
      if (hidden.has(e.feedUrl)) continue;
      if (sinceMs !== undefined && !(e.publishedAt !== undefined && Date.parse(e.publishedAt) >= sinceMs)) continue;
      const row = await registerCard(db, e);
      if (hiddenEps.has(row.id)) continue;
      episodes.push({ ...e, id: row.id });
    }
  }
  // M21 T087: listen and comment counts for the rich rows (counts only, never names — G6).
  if (episodes.length > 0) {
    try {
      const stats = await statsFor(db, episodes.map((e) => e.id));
      for (const e of episodes) { const s = stats.get(e.id); if (s) e.stats = s; }
    } catch (err) { console.warn(`[search] stats: ${err instanceof Error ? err.message : String(err)}`); }
  }
  return c.json({ shows, episodes, episodeSearch: episodesR.status === 'fulfilled' ? 'ok' : 'unavailable', source: { shows: 'apple' } });
});

  /**
   * GET /v1/search/people?q= (owner, 2026-10-01): listeners by display name, at most 20 —
   * only `{ id, displayName }`, the fields `GET /v1/listeners/:id` shows to anyone. A
   * suspended account is not found (M6 FR-015); a deleted one has no row. Blocks hide both
   * ways (M6 FR-008): you are not found by someone you blocked, nor they by you. Names
   * starting with the term come first.
   */
  search.get('/people', optionalAuth, async (c) => {
    const q = normaliseQuery(c.req.query('q') ?? '');
    if (q.length < 1 || q.length > 40) throw new ApiError('validation', 'q must be 1–40 characters.', { fields: ['q'] });
    if (!isSearchable(q)) return c.json({ listeners: [] });
    const viewer = c.get('listener')?.id;
    const who = viewer ?? c.req.header('x-forwarded-for') ?? 'anon';
    if (throttled(`people:${who}`, Date.now(), 30)) throw new ApiError('locked', 'Too many searches — try again in a moment.', { retryAfterSeconds: 30 });
    const like = q.replace(/[\\%_]/g, (m) => '\\' + m);
    const rows = await peopleMatching(c.get('db'), like, viewer ?? null);
    return c.json({ listeners: rows.map((r) => ({ id: r.id, displayName: r.display_name })) });
  });

  return search;
}
