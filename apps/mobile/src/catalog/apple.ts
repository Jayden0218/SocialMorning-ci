/**
 * Apple's public podcast search (contracts/catalog.ts, research R5).
 *
 * KEYLESS, and that is why it is the one in M1. Podcast Index — the other
 * catalogue the constitution settles on — returns 403 without a key plus
 * secret plus a SHA-1 auth header, i.e. a credential that would have to ship
 * inside the app bundle. It belongs behind our own server (M0/M5), not here.
 *
 * Apple rate-limits at roughly 20 requests a minute, which is why the search
 * screen debounces rather than querying per keystroke.
 */
export type CatalogShow = {
  catalogId: number;
  title: string;
  author: string;
  /** REQUIRED. A result without one cannot be subscribed to or played. */
  feedUrl: string;
  artworkUrl?: string;
  episodeCount?: number;
  genres: string[];
};

export class CatalogError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Podcast search is unavailable right now (${status}).`);
    this.name = 'CatalogError';
    this.status = status;
  }
}

const ENDPOINT = 'https://itunes.apple.com/search';

type AppleResult = {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  trackCount?: number;
  genres?: string[];
};

export async function searchShows(term: string, signal?: AbortSignal): Promise<CatalogShow[]> {
  // An empty box is not a query. Asking Apple about '' spends one of the
  // twenty requests a minute to be told nothing.
  if (term.trim() === '') return [];

  const url = `${ENDPOINT}?media=podcast&term=${encodeURIComponent(term.trim())}&limit=25`;
  const response = await fetch(url, signal === undefined ? {} : { signal });
  if (!response.ok) throw new CatalogError(response.status);

  const body = (await response.json()) as { results?: AppleResult[] };
  const results = body.results ?? [];

  return results
    .map((r): CatalogShow | undefined => {
      // Apple lists shows it has no feed for. They are not subscribable, so
      // they are dropped rather than rendered as a row that goes nowhere.
      if (r.feedUrl === undefined || r.collectionId === undefined) return undefined;
      const artworkUrl = r.artworkUrl600 ?? r.artworkUrl100;
      return {
        catalogId: r.collectionId,
        title: r.collectionName ?? '',
        author: r.artistName ?? '',
        feedUrl: r.feedUrl,
        ...(artworkUrl !== undefined && { artworkUrl }),
        ...(r.trackCount !== undefined && { episodeCount: r.trackCount }),
        genres: r.genres ?? [],
      };
    })
    .filter((show): show is CatalogShow => show !== undefined);
}
