// The search box's rotating hints and "Try searching": the admin's words when set, else the ones worked out from the charts.
/**
 * M25 A7 (`app_config` keys `searchHints`, `listSizes.searchHints`). An empty word list — the
 * default — keeps today's behaviour exactly: the top show names (src/discover/trending.ts) and
 * the suggestions (src/search/suggest.ts).
 */
import type { ChartTab } from '@/discover/sections';
import { trendingHints as fromCharts } from '@/discover/trending';
import { getAppConfig } from './store';

/** The admin's words, or `computed` when there are none; at most `listSizes.searchHints` of them. */
export function withHints(computed: readonly string[]): string[] {
  const c = getAppConfig();
  return [...(c.searchHints.length > 0 ? c.searchHints : computed)].slice(0, c.listSizes.searchHints);
}

/** Drop-in for `trendingHints` in src/discover/trending.ts, with the admin's words first. */
export const trendingHints = (chart: readonly ChartTab[]): string[] => withHints(fromCharts(chart));

/** "Try searching" on the Search page: the admin's words when set, else the suggestions as before. */
export function tryWords(computed: readonly string[]): string[] {
  const words = getAppConfig().searchHints;
  return words.length > 0 ? [...words] : [...computed];
}
