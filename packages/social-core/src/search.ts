// Search rules: match words, put the library first, and remove duplicate results.
/**
 * M5 FR-005 (research R7): library-first search. `matchesTerm` is the local match;
 * `mergeSearch` puts the library first and never repeats a library hit as a catalogue
 * hit (guard G5); `collapseByFeed` folds duplicate catalogue shows by feed URL;
 * `collapseEpisodes` folds duplicate catalogue episodes by feed URL + guid (G8: Apple
 * returned "#164" twice under two track ids on the phone, 2026-09-22). iOS i10 (2026-09-27):
 * the same Reply All episode still came twice — two guids, same show, same title — so an
 * episode is also the same when its show title and its title match (`sameEpisodeKey`).
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

type EpisodeKeys = { feedUrl: string; guid: string; title?: string; showTitle?: string };

/** The two keys an episode is known by: its feed + guid, and (when both are known) its show title + title. */
function episodeKeys(e: EpisodeKeys): string[] {
  const keys = [`${normaliseFeedUrl(e.feedUrl)}\u0001${e.guid}`];
  const title = e.title?.trim().toLowerCase();
  const show = e.showTitle?.trim().toLowerCase();
  if (title && show) keys.push(`t\u0001${show}\u0001${title}`);
  return keys;
}

export function collapseEpisodes<T extends EpisodeKeys>(episodes: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of episodes) {
    const keys = episodeKeys(e);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(e);
  }
  return out;
}

export function mergeSearch<S extends { feedUrl: string }, E extends EpisodeKeys>(
  library: { shows: readonly S[]; episodes: readonly E[] },
  catalogue: { shows: readonly S[]; episodes: readonly E[] },
): { shows: S[]; episodes: E[] } {
  const libShows = new Set(library.shows.map((s) => normaliseFeedUrl(s.feedUrl)));
  const libEpisodes = new Set(library.episodes.flatMap(episodeKeys));
  return {
    shows: [...library.shows, ...collapseByFeed(catalogue.shows).filter((s) => !libShows.has(normaliseFeedUrl(s.feedUrl)))],
    episodes: [...library.episodes, ...collapseEpisodes(catalogue.episodes).filter((e) => !episodeKeys(e).some((k) => libEpisodes.has(k)))],
  };
}

/** Feed URLs differ only in trailing slashes and scheme case between sources. */
export function normaliseFeedUrl(u: string): string {
  return u.trim().replace(/^HTTPS?:/i, (m) => m.toLowerCase()).replace(/\/+$/, '');
}
