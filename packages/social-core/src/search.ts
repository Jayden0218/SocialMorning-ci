/**
 * M5 FR-005 (research R7): library-first search. `matchesTerm` is the local match;
 * `mergeSearch` puts the library first and never repeats a library hit as a catalogue
 * hit (guard G5); `collapseByFeed` folds duplicate catalogue shows by feed URL.
 */
export function matchesTerm(term: string, ...texts: (string | undefined)[]): boolean {
  const tokens = term.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return false;
  const hay = texts.filter((t): t is string => typeof t === 'string').join(' ').toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

export function collapseByFeed<T extends { feedUrl: string }>(shows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of shows) {
    const k = normaliseFeedUrl(s.feedUrl);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

export function mergeSearch<S extends { feedUrl: string }, E extends { feedUrl: string; guid: string }>(
  library: { shows: readonly S[]; episodes: readonly E[] },
  catalogue: { shows: readonly S[]; episodes: readonly E[] },
): { shows: S[]; episodes: E[] } {
  const libShows = new Set(library.shows.map((s) => normaliseFeedUrl(s.feedUrl)));
  const libEpisodes = new Set(library.episodes.map((e) => `${normaliseFeedUrl(e.feedUrl)}\u0001${e.guid}`));
  return {
    shows: [...library.shows, ...collapseByFeed(catalogue.shows).filter((s) => !libShows.has(normaliseFeedUrl(s.feedUrl)))],
    episodes: [...library.episodes, ...catalogue.episodes.filter((e) => !libEpisodes.has(`${normaliseFeedUrl(e.feedUrl)}\u0001${e.guid}`))],
  };
}

/** Feed URLs differ only in trailing slashes and scheme case between sources. */
export function normaliseFeedUrl(u: string): string {
  return u.trim().replace(/^HTTPS?:/i, (m) => m.toLowerCase()).replace(/\/+$/, '');
}
