// Refreshes one show's feed, keeping the saved copy if it fails.
/**
 * Refreshing one show: conditional GET, parse, cache.
 *
 * Principle IV runs through the whole file. A refresh that fails must never
 * throw away episodes we already have — a listener on a train with no signal
 * still owns their library — so a failure with a cache returns the cache and
 * says `stale: true`, and only a failure with NOTHING cached is an error.
 */
import { FEED_TIMEOUT_MS, parseFeed, readFeedText, type FeedWarning, type MakeDecoder } from '@socialmorning/feed-parser';
import { hash } from './hash';
import type { CachedEpisode, CachedShow, FeedCache } from '@/storage/types';

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

/**
 * M23 US5: the decoder the shared reader is given. Looked up 2026-10-07: Expo 58's native
 * `TextDecoder` (`node_modules/expo/src/winter/TextDecoder.ts`) is UTF-8 only and throws
 * RangeError for any other label. So on a phone a GBK or Big5 feed falls back to UTF-8 (the old
 * behaviour — titles may show replacement characters) and Latin-1 / Windows-1252 is decoded by
 * hand in `@socialmorning/feed-parser`. The server decodes all of them; the shows the server
 * lists (Discover, picks) therefore read correctly even where the phone's own refresh cannot.
 */
const phoneDecoder: MakeDecoder = (label, fatal) => new TextDecoder(label, { fatal });

/**
 * Fetch with the M23 deadline: 8 s for headers and body together, and the caller's own signal
 * still cancels. Built from AbortController + setTimeout rather than `AbortSignal.timeout/any`
 * so it does not depend on which of those a given runtime has.
 */
async function fetchWithDeadline(url: string, init: RequestInit, signal: AbortSignal | undefined, read: (r: Response) => Promise<string>): Promise<{ response: Response; body: string | undefined }> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signal?.aborted) ctl.abort();
  signal?.addEventListener('abort', onAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ctl.abort(); reject(new FeedError(COULD_NOT_REACH)); }, FEED_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: ctl.signal });
        // A 304 or an error status has no feed to read.
        return { response, body: response.ok ? await read(response) : undefined };
      })(),
      late,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

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
    // M23 US5: 8 s deadline, 5 MB cap (streamed where the runtime streams), the feed's charset.
    const got = await fetchWithDeadline(feedUrl, { headers }, signal, (r) => readFeedText(r, phoneDecoder));
    response = got.response;
    if (response.status === 304) {
      const hit = cached(cache, feedUrl, false);
      /* istanbul ignore next -- a 304 can only follow a cached etag */
      if (hit === undefined) throw new FeedError(COULD_NOT_REACH);
      return hit;
    }
    if (!response.ok || got.body === undefined) throw new FeedError(COULD_NOT_REACH);
    body = got.body;
  } catch {
    // (Also: over 5 MB, or no answer in 8 s — refused the same way, keeping the cache.)
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
