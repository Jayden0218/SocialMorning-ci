/**
 * "Try searching" (M10): names worth typing, taken from the Discover copy already on the
 * phone — popular shows, then the chart's and the picks' shows. No search log exists
 * and none is kept, so these are shows, not other people's searches.
 */
import type { Discover } from '@/social/api';

export function suggestions(body: Discover | undefined, hidden: ReadonlySet<string>, n = 8): string[] {
  if (!body) return [];
  const names = [
    ...(body.shows ?? []).filter((s) => !hidden.has(s.feedUrl)).map((s) => s.title),
    ...body.trending.filter((i) => !hidden.has(i.episode.feedUrl)).map((i) => i.episode.showTitle),
    ...body.picks.filter((i) => !hidden.has(i.episode.feedUrl)).map((i) => i.episode.showTitle),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= n) break;
  }
  return out;
}
