// Sorts and filters the shows on a category page.
/**
 * The category page's list controls (Owner, 2026-10-01, after the reference's category page):
 * "All" keeps the server's chart order; "Newest" puts the show with the most recent episode
 * first (shows with no date go last, in chart order); "Not subscribed only" drops shows the
 * listener already follows. Pure, so the order is tested without a screen.
 */
import type { ShowCard } from '@/social/api';

export type CategorySort = 'all' | 'newest';

function stamp(s: ShowCard): number | undefined {
  const iso = s.latestEpisode?.publishedAt;
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
}

export function sortCategoryShows(shows: readonly ShowCard[], sort: CategorySort): ShowCard[] {
  if (sort === 'all') return [...shows];
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
  return sortCategoryShows(kept, opts.sort);
}
