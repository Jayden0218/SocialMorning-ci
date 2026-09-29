import { Hono } from 'hono';
import { collapseByFeed, collapseEpisodes } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { optionalAuth } from '../auth/session.ts';
import { ApiError } from '../errors.ts';
import { cached, TTL } from '../db/repos/cache.ts';
import { CatalogRateLimited, searchEpisodes, searchShows, type EpisodeCard, type ShowCard } from '../catalog/apple.ts';
import { registerCard } from '../catalog/feed.ts';
import { hiddenFeedUrls } from '../db/repos/moderation.ts';

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
  const local = await db.query<{ feed_url: string; title: string; author: string; cover_url: string | null; category: string }>(
    `SELECT feed_url, title, author, cover_url, category FROM hosted_shows
      WHERE deleted_at IS NULL AND title ILIKE '%' || $1 || '%' ORDER BY created_at DESC LIMIT 10`,
    [q.replace(/[\\%_]/g, (m) => '\\' + m)],
  );
  const created: ShowCard[] = local.map((r) => ({ feedUrl: r.feed_url, title: r.title, author: r.author, genres: [r.category], ...(r.cover_url ? { imageUrl: r.cover_url } : {}) }));
  const rateLimited = [showsR, episodesR].some((r) => r.status === 'rejected' && r.reason instanceof CatalogRateLimited);
  if (showsR.status === 'rejected' && episodesR.status === 'rejected' && created.length === 0) {
    if (rateLimited) throw new ApiError('locked', 'The catalogue is busy — try again in a moment.', { retryAfterSeconds: 30 });
    throw new ApiError('unavailable', 'The catalogue is not answering right now.');
  }
  const hidden = await hiddenFeedUrls(db); // M6 (FR-014): a hidden show is not found
  const fromApple = showsR.status === 'fulfilled' ? collapseByFeed(showsR.value.body) : [];
  const shows = [...created, ...fromApple.filter((s) => !created.some((x) => x.feedUrl === s.feedUrl))].filter((s) => !hidden.has(s.feedUrl));
  const episodes: (EpisodeCard & { id: string })[] = [];
  if (episodesR.status === 'fulfilled') {
    for (const e of collapseEpisodes(episodesR.value.body)) {
      if (hidden.has(e.feedUrl)) continue;
      const row = await registerCard(db, e);
      episodes.push({ ...e, id: row.id });
    }
  }
  return c.json({ shows, episodes, episodeSearch: episodesR.status === 'fulfilled' ? 'ok' : 'unavailable', source: { shows: 'apple' } });
});

  return search;
}
