// Searches, sorts and groups your subscribed shows.
/**
 * My subscriptions (M12 FR-081): search, sort, and the Starred section, as pure functions so
 * the page stays a view. "Recently updated" sorts by each show's newest episode (a show with
 * none last); "Recently added" by when you subscribed; "A–Z" by title, ignoring case.
 */
import { matchesAll } from './history';

export type SubSort = 'updated' | 'az' | 'added';
export const SUB_SORTS: readonly { key: SubSort; label: string }[] = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'az', label: 'A–Z' },
  { key: 'added', label: 'Recently added' },
];

export type SubRow = { feedUrl: string; title: string; subscribedAt: number; starred: boolean; latestAt?: number };

export function arrangeSubscriptions<T extends SubRow>(rows: readonly T[], term: string, sort: SubSort): { starred: T[]; rest: T[] } {
  const by: Record<SubSort, (a: T, b: T) => number> = {
    updated: (a, b) => (b.latestAt ?? -Infinity) - (a.latestAt ?? -Infinity) || a.title.localeCompare(b.title),
    az: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    added: (a, b) => b.subscribedAt - a.subscribedAt,
  };
  const shown = rows.filter((r) => matchesAll(term, [r.title])).sort(by[sort]);
  return { starred: shown.filter((r) => r.starred), rest: shown.filter((r) => !r.starred) };
}
