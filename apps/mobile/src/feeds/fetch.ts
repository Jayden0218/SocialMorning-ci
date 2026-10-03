/**
 * Refreshing one show: conditional GET, parse, cache.
 *
 * Principle IV runs through the whole file. A refresh that fails must never
 * throw away episodes we already have — a listener on a train with no signal
 * still owns their library — so a failure with a cache returns the cache and
 * says `stale: true`, and only a failure with NOTHING cached is an error.
 */
import { parseFeed, type FeedWarning } from '@socialmorning/feed-parser';
import { hash } from './hash';
import type { CachedEpisode, CachedShow, FeedCache } from '../storage/types';

export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedError';
  }
}

export type RefreshResult = {
  show: CachedShow;
  episodes: CachedEpisode[];
  warnings: FeedWarning[];
  /** True when this is the cached copy because the refresh did not succeed. */
  stale: boolean;
};

const COULD_NOT_REACH =
  'Could not reach this podcast’s feed. Check your connection and try again.';

function cached(cache: FeedCache, feedUrl: string, stale: boolean): RefreshResult | undefined {
  const show = cache.getShow(feedUrl);
  if (show === undefined) return undefined;
  return { show, episodes: cache.listEpisodes(feedUrl), warnings: show.lastWarnings, stale };
}

export async function refreshShow(
  feedUrl: string,
  cache: FeedCache,
  now: number,
  signal?: AbortSignal,
): Promise<RefreshResult> {
  const existing = cache.getShow(feedUrl);
  const headers: Record<string, string> = {};
  // Conditional GET: a feed that has not changed costs one 304 and no parse.
  if (existing?.etag !== undefined) headers['If-None-Match'] = existing.etag;
  if (existing?.lastModified !== undefined) headers['If-Modified-Since'] = existing.lastModified;

  let response: Response;
  let body: string;
  try {
    response = await fetch(feedUrl, { headers, ...(signal === undefined ? {} : { signal }) });
    if (response.status === 304) {
      const hit = cached(cache, feedUrl, false);
      /* istanbul ignore next -- a 304 can only follow a cached etag */
      if (hit === undefined) throw new FeedError(COULD_NOT_REACH);
      return hit;
    }
    if (!response.ok) throw new FeedError(COULD_NOT_REACH);
    body = await response.text();
  } catch {
    // Network down, DNS gone, 500, malformed transfer — all the same to a
    // listener, and all recoverable if we already have the show.
    const fallback = cached(cache, feedUrl, true);
    if (fallback !== undefined) return fallback;
    throw new FeedError(COULD_NOT_REACH);
  }

  const parsed = parseFeed(body, feedUrl, { hash });

  // The cache is keyed by the url we ASKED for, never by `response.url`.
  // A publisher's 301 to a CDN mirror must not silently re-key the show and
  // orphan its subscription and its saved positions.
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  cache.put(
    feedUrl,
    parsed,
    {
      ...(etag !== null && { etag }),
      ...(lastModified !== null && { lastModified }),
    },
    now,
  );

  const stored = cached(cache, feedUrl, false);
  /* istanbul ignore next -- put() was just called with this feedUrl */
  if (stored === undefined) throw new FeedError(COULD_NOT_REACH);
  return stored;
}
