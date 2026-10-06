// Searches, sorts and groups your subscribed shows.
/**
 * My subscriptions (M12 FR-081): search, sort, and the Starred section, as pure functions so
 * the page stays a view. "Recently updated" sorts by each show's newest episode (a show with
 * none last); "Recently added" by when you subscribed; "A–Z" by title, ignoring case.
 * M21 US8 (FR-072): "Default" is your own order, set on the manage page; shows not in it
 * follow, newest subscription first.
 */
import { matchesAll } from './history';

export type SubSort = 'default' | 'updated' | 'az' | 'added';
export const SUB_SORTS: readonly { key: SubSort; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'az', label: 'A–Z' },
  { key: 'added', label: 'Recently added' },
];

export type SubRow = { feedUrl: string; title: string; subscribedAt: number; starred: boolean; latestAt?: number };

/** "Default": my order first (by its position), then everything else newest subscription first. */
export function byMyOrder<T extends SubRow>(order: readonly string[]): (a: T, b: T) => number {
  const pos = new Map(order.map((u, i) => [u, i]));
  const at = (r: T) => pos.get(r.feedUrl) ?? Number.MAX_SAFE_INTEGER;
  return (a, b) => at(a) - at(b) || b.subscribedAt - a.subscribedAt;
}

export function arrangeSubscriptions<T extends SubRow>(rows: readonly T[], term: string, sort: SubSort, order: readonly string[] = []): { starred: T[]; rest: T[] } {
  const by: Record<SubSort, (a: T, b: T) => number> = {
    default: byMyOrder<T>(order),
    updated: (a, b) => (b.latestAt ?? -Infinity) - (a.latestAt ?? -Infinity) || a.title.localeCompare(b.title),
    az: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    added: (a, b) => b.subscribedAt - a.subscribedAt,
  };
  const shown = rows.filter((r) => matchesAll(term, [r.title])).sort(by[sort]);
  return { starred: shown.filter((r) => r.starred), rest: shown.filter((r) => !r.starred) };
}

/** M21 US8 (manage page): tap one cover, then another — the first takes the second's place. */
export function moveTo(order: readonly string[], from: string, to: string): string[] {
  const i = order.indexOf(from);
  const j = order.indexOf(to);
  if (i < 0 || j < 0 || i === j) return [...order];
  const next = [...order];
  next.splice(i, 1);
  next.splice(j, 0, from);
  return next;
}
