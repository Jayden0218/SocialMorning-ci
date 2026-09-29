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

export function arrangeSubscriptions(rows: readonly SubRow[], term: string, sort: SubSort): { starred: SubRow[]; rest: SubRow[] } {
  const by: Record<SubSort, (a: SubRow, b: SubRow) => number> = {
    updated: (a, b) => (b.latestAt ?? -Infinity) - (a.latestAt ?? -Infinity) || a.title.localeCompare(b.title),
    az: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    added: (a, b) => b.subscribedAt - a.subscribedAt,
  };
  const shown = rows.filter((r) => matchesAll(term, [r.title])).sort(by[sort]);
  return { starred: shown.filter((r) => r.starred), rest: shown.filter((r) => !r.starred) };
}
