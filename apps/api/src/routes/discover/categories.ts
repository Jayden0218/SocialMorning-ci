// Category routes: list genres and show each genre's top shows.
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { CatalogRateLimited } from '../../catalog/apple.ts';
import { GENRE_LIST, genreName } from '../../catalog/genres.ts';
import { CATEGORY_PAGES, CATEGORY_SHOWS, CATEGORY_TTL, servedCategory, type CategoryPage } from '../../db/repos/discover/served.ts';

export { CATEGORY_PAGES, CATEGORY_SHOWS, CATEGORY_TTL };

/**
 * M10 (2026-09-27), mounted at /v1/categories — public.
 *   GET /             → { categories: { genreId, name }[] } — Apple's top-level genres
 *   GET /:genreId     → { genreId, name, shows: ShowCard[] (≤ 20 + pins), stale, hasMore, pinned, defaultSort? }
 *                       — that genre's chart; M12 FR-072: each show carries `latestEpisode { title, publishedAt }` when Apple lists one
 * One chart call + one lookup per genre, cached 6 h (a chart moves slowly, and Apple
 * allows ~20 calls a minute). Apple failing with a cached copy → that copy, `stale: true`;
 * with none → 503 (429 → `locked`). A hidden show is removed at serve time (FR-014).
 *
 * Owner, 2026-10-05 ("when scroll to bottom, it should continue to get more"):
 *   GET /:genreId?page=N (N = 1…9) → the chart's next 20 shows, same shape, plus `hasMore`.
 * Later pages read the chart's 200 ids (one call, cached 6 h) and look up only their own 20.
 *
 * M25 A2 (lane AL): the owner's `category:<genreId>` list — hides leave every page; pins sit at
 * their slots on page 0 marked `pinned: true` (and listed in `pinned`, so the phone keeps them in
 * place under For you and Newest) and never come again on a later page; `defaultSort` is the chip
 * the page opens on when the owner chose one. Logic: db/repos/discover/served.ts `servedCategory`.
 */
function catalogError(e: unknown): never {
  if (e instanceof CatalogRateLimited) throw new ApiError('locked', 'The catalogue is busy — try again in a moment.', { retryAfterSeconds: 30 });
  if (e instanceof ApiError) throw e;
  throw new ApiError('unavailable', 'The catalogue is not answering right now.');
}

export const categories = new Hono<AuthEnv>();

categories.get('/', (c) => c.json({ categories: GENRE_LIST }));

categories.get('/:genreId', async (c) => {
  const raw = c.req.param('genreId');
  const genreId = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  const name = Number.isNaN(genreId) ? undefined : genreName(genreId);
  if (name === undefined) throw new ApiError('not_found', 'No such category.');
  const rawPage = c.req.query('page') ?? '0';
  if (!/^\d{1,2}$/.test(rawPage)) throw new ApiError('validation', 'page must be a whole number.');
  let body: CategoryPage;
  try { body = await servedCategory(c.get('db'), c.get('catalog').fetch, genreId, Number(rawPage)); } catch (e) { catalogError(e); }
  return c.json({ genreId, name, ...body });
});
