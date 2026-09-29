import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { ApiError } from '../errors.ts';
import { cached } from '../db/repos/cache.ts';
import { hiddenFeedUrls } from '../db/repos/moderation.ts';
import { CatalogRateLimited, topShows, type ShowCard } from '../catalog/apple.ts';
import { GENRE_LIST, genreName } from '../catalog/genres.ts';

/**
 * M10 (2026-09-27), mounted at /v1/categories — public.
 *   GET /             → { categories: { genreId, name }[] } — Apple's top-level genres
 *   GET /:genreId     → { genreId, name, shows: ShowCard[] (≤ 20), stale } — that genre's chart;
 *                       M12 FR-072: each show carries `latestEpisode { title, publishedAt }` when Apple lists one
 * One chart call + one lookup per genre, cached 6 h (a chart moves slowly, and Apple
 * allows ~20 calls a minute). Apple failing with a cached copy → that copy, `stale: true`;
 * with none → 503 (429 → `locked`). A hidden show is removed at serve time (FR-014).
 */
export const CATEGORY_TTL = 6 * 60 * 60_000;
export const CATEGORY_SHOWS = 20;

export const categories = new Hono<AuthEnv>();

categories.get('/', (c) => c.json({ categories: GENRE_LIST }));

categories.get('/:genreId', async (c) => {
  const raw = c.req.param('genreId');
  const genreId = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  const name = Number.isNaN(genreId) ? undefined : genreName(genreId);
  if (name === undefined) throw new ApiError('not_found', 'No such category.');
  const db = c.get('db');
  let r: { body: ShowCard[]; stale: boolean };
  try {
    r = await cached<ShowCard[]>(db, `apple:category:${genreId}`, CATEGORY_TTL, () => topShows(c.get('catalog').fetch, genreId, CATEGORY_SHOWS, { latest: true }));
  } catch (e) {
    if (e instanceof CatalogRateLimited) throw new ApiError('locked', 'The catalogue is busy — try again in a moment.', { retryAfterSeconds: 30 });
    throw new ApiError('unavailable', 'The catalogue is not answering right now.');
  }
  const hidden = await hiddenFeedUrls(db);
  const shows = r.body.filter((s) => !hidden.has(s.feedUrl)).slice(0, CATEGORY_SHOWS);
  return c.json({ genreId, name, shows, stale: r.stale });
});
