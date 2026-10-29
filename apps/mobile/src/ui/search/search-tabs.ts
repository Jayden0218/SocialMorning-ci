// The Search results' tabs and the "Published" filter, as plain data.
/** M31 T030 (split out of SearchPage.tsx, review D7). Order is the drawn one: All · Shows · Episodes · Moments (NEW) · People. */
import type { SearchSince } from '@/discover/explore-api';

export type Tab = 'all' | 'shows' | 'episodes' | 'moments' | 'people';
export const TABS: { key: Tab; label: string; isNew?: true }[] = [
  { key: 'all', label: 'All' }, { key: 'shows', label: 'Shows' }, { key: 'episodes', label: 'Episodes' }, { key: 'moments', label: 'Moments', isNew: true }, { key: 'people', label: 'People' },
];
export const TAB_KEYS: Tab[] = TABS.map((t) => t.key);

/** M21: the date chips; `since` is what the server takes. */
export const SINCE: { key: SearchSince; label: string; days?: number }[] = [
  { key: 'any', label: 'Any' }, { key: '30d', label: 'Last 30 days', days: 30 }, { key: '180d', label: 'Last 6 months', days: 180 },
];

/** The tabs that list episodes, where the Published filter applies (the drawing shows it above All and Episodes). */
export const hasSinceFilter = (tab: Tab): boolean => tab === 'all' || tab === 'episodes';

/**
 * M31 F2a (design-pulse2 `search--empty`: the chips are not drawn when nothing matches). The row stays when a date
 * filter is on (`since` not Any): without it the person could not widen the filter that emptied the page.
 */
export const showSinceChips = (tab: Tab, nothing: boolean, since: SearchSince): boolean => hasSinceFilter(tab) && !(nothing && since === 'any');

/** Where the centred blocks start, from the top of the screen (drawn `center(…, 160)` for "Nothing matches.", `center(…, 220)` for "No one by that name."). */
export const BLOCK_TOP = { empty: 165, people: 220 } as const;
