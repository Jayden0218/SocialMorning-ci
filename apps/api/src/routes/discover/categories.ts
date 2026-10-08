// Category routes: list genres and show each genre's top shows.
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { cached } from '../../db/repos/cache.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';
import { CatalogRateLimited, chartIds, showsByIds, topShows, type ShowCard } from '../../catalog/apple.ts';
import { GENRE_LIST, genreName } from '../../catalog/genres.ts';
import { featuredFirst, getFeatures } from '../../db/repos/discover/discover-settings.ts';
import type { Db } from '../../db/db.ts';

/** M15: a featured show that is not on Apple's chart, drawn from the feed the server already read. */
async function showCardFromCache(db: Db, feedUrl: string): Promise<ShowCard | undefined> {
  const [row] = await db.query<{ body: unknown }>('SELECT body FROM cache WHERE key = $1', [`feed:${feedUrl}`]);
  if (!row) return undefined;
  try {
    const b = (typeof row.body === 'string' ? JSON.parse(row.body) : row.body) as { show?: { title?: string; author?: string; imageUrl?: string } };
    if (!b.show?.title) return undefined;
    return { feedUrl, title: b.show.title, author: b.show.author ?? '', genres: [], ...(b.show.imageUrl ? { imageUrl: b.show.imageUrl } : {}) };
  } catch { return undefined; }
}

/**
 * M10 (2026-09-27), mounted at /v1/categories — public.
 *   GET /             → { categories: { genreId, name }[] } — Apple's top-level genres
 *   GET /:genreId     → { genreId, name, shows: ShowCard[] (≤ 20), stale } — that genre's chart;
 *                       M12 FR-072: each show carries `latestEpisode { title, publishedAt }` when Apple lists one
 * One chart call + one lookup per genre, cached 6 h (a chart moves slowly, and Apple
 * allows ~20 calls a minute). Apple failing with a cached copy → that copy, `stale: true`;
 * with none → 503 (429 → `locked`). A hidden show is removed at serve time (FR-014).
 *
 * Owner, 2026-10-05 ("when scroll to bottom, it should continue to get more"):
 *   GET /:genreId?page=N (N = 1…9) → the chart's next 20 shows, same shape, plus `hasMore`.
 * Page 0 is the call above, unchanged (featured first). Later pages read the chart's 200 ids
 * (one call, cached 6 h) and look up only their own 20 (one lookup per page, cached 6 h).
 * A featured show also in a later page comes twice; the phone keeps the first.
 */
export const CATEGORY_TTL = 6 * 60 * 60_000;
export const CATEGORY_SHOWS = 20;
/** Apple's chart stops at 200 shows (curl, 2026-10-05), so 10 pages of 20. */
export const CATEGORY_PAGES = 10;

function catalogError(e: unknown): never {
  if (e instanceof CatalogRateLimited) throw new ApiError('locked', 'The catalogue is busy — try again in a moment.', { retryAfterSeconds: 30 });
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
  const page = Number(rawPage);
  const db = c.get('db');
  if (page >= CATEGORY_PAGES) return c.json({ genreId, name, shows: [], stale: false, hasMore: false });
  if (page > 0) {
    const f = c.get('catalog').fetch;
    let ids: { body: string[]; stale: boolean };
    let got: { body: ShowCard[]; stale: boolean };
    try {
      ids = await cached<string[]>(db, `apple:category-ids:${genreId}`, CATEGORY_TTL, () => chartIds(f, genreId, CATEGORY_SHOWS * CATEGORY_PAGES));
      const mine = ids.body.slice(page * CATEGORY_SHOWS, (page + 1) * CATEGORY_SHOWS);
      got = mine.length === 0
        ? { body: [], stale: false }
        : await cached<ShowCard[]>(db, `apple:category:${genreId}:${page}`, CATEGORY_TTL, () => showsByIds(f, mine, { latest: true }));
    } catch (e) { catalogError(e); }
    const hiddenHere = await hiddenFeedUrls(db);
    const shows = got.body.filter((s) => !hiddenHere.has(s.feedUrl));
    const hasMore = (page + 1) * CATEGORY_SHOWS < ids.body.length && page + 1 < CATEGORY_PAGES;
    return c.json({ genreId, name, shows, stale: ids.stale || got.stale, hasMore });
  }
  let r: { body: ShowCard[]; stale: boolean };
  try {
    r = await cached<ShowCard[]>(db, `apple:category:${genreId}`, CATEGORY_TTL, () => topShows(c.get('catalog').fetch, genreId, CATEGORY_SHOWS, { latest: true }));
  } catch (e) { catalogError(e); }
  const hidden = await hiddenFeedUrls(db);
  const chart = r.body.filter((s) => !hidden.has(s.feedUrl));
  // M15 T034 (FR-028): the owner's featured shows first, in the owner's order. Unreadable → the chart as it was.
  let featured: string[] = [];
  try { featured = (await getFeatures(db, genreId)).filter((f) => !hidden.has(f)); } catch (e) { console.warn(`[categories] features skipped: ${e instanceof Error ? e.message : String(e)}`); }
  const extra = new Map<string, ShowCard>();
  for (const f of featured.filter((x) => !chart.some((s) => s.feedUrl === x))) {
    const card = await showCardFromCache(db, f);
    if (card) extra.set(f, card);
  }
  const shows = featuredFirst(chart, featured, (f) => extra.get(f)).slice(0, CATEGORY_SHOWS);
  // A full first page means Apple may have more; a short one is the whole chart.
  return c.json({ genreId, name, shows, stale: r.stale, hasMore: r.body.length >= CATEGORY_SHOWS });
});
