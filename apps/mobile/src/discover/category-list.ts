// Sorts and filters the shows on a category page.
/**
 * The category page's list controls (Owner, 2026-10-01, after the reference's category page):
 * "All" (M21: labelled "Hot") keeps the server's chart order; M21 "For you" keeps chart order
 * but puts the shows the listener does not follow yet first (the ones they follow go last); "Newest" puts the show with the most recent episode
 * first (shows with no date go last, in chart order); "Not subscribed only" drops shows the
 * listener already follows. Pure, so the order is tested without a screen.
 */
import type { ShowCard } from '@/social/api';

export type CategorySort = 'forYou' | 'all' | 'newest';

function stamp(s: ShowCard): number | undefined {
  const iso = s.latestEpisode?.publishedAt;
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
}

export function sortCategoryShows(shows: readonly ShowCard[], sort: CategorySort): ShowCard[] {
  if (sort !== 'newest') return [...shows];
  // Decorate with the chart index so ties and undated shows keep chart order.
  return shows
    .map((s, i) => ({ s, i, t: stamp(s) }))
    .sort((a, b) => {
      if (a.t === undefined && b.t === undefined) return a.i - b.i;
      if (a.t === undefined) return 1;
      if (b.t === undefined) return -1;
      return b.t - a.t || a.i - b.i;
    })
    .map((x) => x.s);
}

export function categoryList(
  shows: readonly ShowCard[],
  opts: { sort: CategorySort; notSubscribedOnly: boolean; subscribed: ReadonlySet<string> },
): ShowCard[] {
  const kept = opts.notSubscribedOnly ? shows.filter((s) => !opts.subscribed.has(s.feedUrl)) : shows;
  if (opts.sort === 'forYou') return [...kept.filter((s) => !opts.subscribed.has(s.feedUrl)), ...kept.filter((s) => opts.subscribed.has(s.feedUrl))];
  return sortCategoryShows(kept, opts.sort);
}

/** Shows per page from the server (`GET /v1/categories/:id?page=N`). */
export const CATEGORY_PAGE = 20;

/**
 * Owner, 2026-10-05 ("when scroll to bottom, it should continue to get more"): whether another
 * page follows. A list kept before `hasMore` existed counts as "more" when it is a full page.
 */
export function hasMoreAfter(body: { shows: readonly ShowCard[]; hasMore?: boolean }): boolean {
  return body.hasMore ?? body.shows.length >= CATEGORY_PAGE;
}

/** The loaded shows with a new page after them; a show already on the list is not added again. */
export function appendPage(shows: readonly ShowCard[], page: readonly ShowCard[]): ShowCard[] {
  const seen = new Set(shows.map((s) => s.feedUrl));
  const out = [...shows];
  for (const s of page) {
    if (seen.has(s.feedUrl)) continue;
    seen.add(s.feedUrl);
    out.push(s);
  }
  return out;
}

/**
 * Owner, 2026-10-05 ("when the categories row is swiped, the yellow one moves also"): which
 * category a swipe has reached. The scroll's progress (0 at the start, 1 at the end) maps evenly
 * onto the categories, so every one — the last ones too, which can never reach the left edge —
 * is reachable by a swipe.
 */
/** M21 T085: the category a sideways swipe of the list lands on — the next one left, the previous right; none past the ends. */
export function neighbourGenre(ids: readonly number[], current: number, dx: number, threshold = 80): number | undefined {
  const i = ids.indexOf(current);
  if (i < 0 || Math.abs(dx) < threshold) return undefined;
  return ids[dx < 0 ? i + 1 : i - 1];
}

export function swipeIndex(offset: number, maxOffset: number, count: number): number {
  if (count <= 1 || maxOffset <= 0) return 0;
  const progress = Math.min(1, Math.max(0, offset / maxOffset));
  return Math.round(progress * (count - 1));
}
