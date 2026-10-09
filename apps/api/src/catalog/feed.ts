// Fetches and parses a podcast RSS feed on the server, cached for one hour.
import { mediaKindOf } from '@socialmorning/social-core';
/**
 * A feed, parsed server-side (M5 research R3/R5): for show picks ("its latest episode"),
 * "new on this show", and the category behind "trending in". Cached 1 h; the parser never
 * throws for a bad item (principle IV).
 */
import { FEED_TIMEOUT_MS, parseFeed, readFeedText, type Episode, type MakeDecoder, type ParsedFeed } from '@socialmorning/feed-parser';
import { hash } from '@socialmorning/social-core';
import type { Db } from '../db/db.ts';
import { cached, deleteCacheKey, touchCacheMarker, TTL } from '../db/repos/cache.ts';
import { upsertEpisode, type EpisodeRow } from '../db/repos/library/episodes.ts';
import { moveSubscriptionsToFeed } from '../db/repos/library/feeds.ts';
import type { EpisodeCard } from './apple.ts';
import { genreIdFor } from './genres.ts';

export const USER_AGENT = 'SocialNet/0.1 (+https://socialmorning-api.vercel.app)';

export type FetchedFeed = { show: ParsedFeed['show']; episodes: Episode[]; warnings: ParsedFeed['warnings'] };

/** Node has full ICU, so every label a feed names (gbk, big5, windows-1252 …) decodes. */
const nodeDecoder: MakeDecoder = (label, fatal) => new TextDecoder(label, { fatal });

/**
 * Runs `work` with an abort signal that fires after `ms`, and gives up at `ms` even if the
 * fetch inside ignores the signal (M23 US5: one feed that never answers must not hold the
 * rest of the hourly run past Vercel's 60 s).
 */
export async function withDeadline<T>(ms: number, label: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`${label}: no answer in ${ms} ms`);
      ctl.abort(e);
      reject(e);
    }, ms);
  });
  try {
    return await Promise.race([work(ctl.signal), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * M23 US5 (FR-009): 8 s for the whole fetch (headers and body), 5 MB at most (streamed, so a
 * huge file stops downloading at the cap), and the text decoded in the feed's own charset.
 * `opts.timeoutMs` exists for the tests.
 */
export async function fetchFeed(db: Db, f: typeof fetch, feedUrl: string, opts: { timeoutMs?: number } = {}): Promise<{ feed: FetchedFeed; stale: boolean }> {
  const r = await cached<FetchedFeed>(db, `feed:${feedUrl}`, TTL.feed, async () => {
    const xml = await withDeadline(opts.timeoutMs ?? FEED_TIMEOUT_MS, `feed ${feedUrl}`, async (signal) => {
      // Seen live 2026-09-22: feeds.podcastindex.org answers 403 to a fetch with no User-Agent (the
      // phone's fetch sends one). Name the app, as any polite feed reader does.
      const res = await f(feedUrl, { signal, headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': USER_AGENT } });
      if (!res.ok) throw new Error(`feed ${feedUrl}: ${res.status}`);
      return readFeedText(res, nodeDecoder);
    });
    const parsed = parseFeed(xml, feedUrl, { hash, maxItems: 50 });
    return { show: parsed.show, episodes: parsed.episodes, warnings: parsed.warnings };
  });
  return { feed: r.body, stale: r.stale };
}

/** M25 S8: how many items a fresh, uncached read of a feed looks through for one episode. */
export const FULL_FEED_ITEMS = 5000;

/**
 * M25 S8: the episode with this guid as the publisher's feed lists it now, or undefined. The
 * cached copy (newest 50) first; when it is not there, one fresh read of the whole feed (a new
 * episode may be younger than the cache, an old one older than the newest 50). Throws when the
 * feed cannot be read at all.
 */
export async function findEpisodeInFeed(db: Db, f: typeof fetch, feedUrl: string, guid: string, opts: { timeoutMs?: number } = {}): Promise<EpisodeCard | undefined> {
  const { feed } = await fetchFeed(db, f, feedUrl, opts);
  const hitCached = feed.episodes.find((e) => e.guid === guid);
  if (hitCached) return toCard(feedUrl, feed.show, hitCached);
  const xml = await withDeadline(opts.timeoutMs ?? FEED_TIMEOUT_MS, `feed ${feedUrl}`, async (signal) => {
    const res = await f(feedUrl, { signal, headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': USER_AGENT } });
    if (!res.ok) throw new Error(`feed ${feedUrl}: ${res.status}`);
    return readFeedText(res, nodeDecoder);
  });
  const parsed = parseFeed(xml, feedUrl, { hash, maxItems: FULL_FEED_ITEMS });
  const e = parsed.episodes.find((x) => x.guid === guid);
  return e ? toCard(feedUrl, parsed.show, e) : undefined;
}

/** The cache key prefix that marks a publisher's `itunes:block` (read by `hiddenFeedUrls`). */
export const FEED_BLOCK_PREFIX = 'feed-block:';

/**
 * M23 US11: `itunes:block` = Yes hides the show (the publisher asked directories not to list
 * it); the mark goes when the feed stops saying so. Kept as a `cache` row because migration
 * 022 has no column for it; the hourly cache sweep deletes only `feed:` and `apple:search:`.
 */
export async function setPublisherBlock(db: Db, feedUrl: string, blocked: boolean): Promise<void> {
  if (blocked) {
    await touchCacheMarker(db, FEED_BLOCK_PREFIX + feedUrl);
  } else {
    await deleteCacheKey(db, FEED_BLOCK_PREFIX + feedUrl);
  }
}

/**
 * M23 US11: `itunes:new-feed-url` — the publisher moved the feed. Every live subscription moves
 * to the new address (the old row becomes a tombstone, so a phone's next sync converges), and
 * the Studio's `subscription_events` stay true. A listener already subscribed to the new
 * address keeps that row. Returns how many subscriptions moved.
 */
export async function followMovedFeed(db: Db, from: string, to: string): Promise<number> {
  if (from === to || !/^https?:\/\//i.test(to)) return 0;
  return moveSubscriptionsToFeed(db, from, to);
}

/** The M3 episode id: the same fnv1a64 the phone computes. */
export const episodeIdOf = (feedUrl: string, guid: string): string => hash(feedUrl + '\u0001' + guid);

export function toCard(feedUrl: string, show: ParsedFeed['show'], e: Episode): EpisodeCard {
  const imageUrl = e.imageUrl ?? show.imageUrl;
  const genre = genreIdFor(show.categories);
  return {
    feedUrl, guid: e.guid, title: e.title, showTitle: show.title, enclosureUrl: e.enclosureUrl,
    ...(imageUrl ? { imageUrl } : {}), ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
    ...(e.publishedAt !== undefined ? { publishedAt: new Date(e.publishedAt).toISOString() } : {}),
    ...(genre ? { genreId: genre.id } : {}),
    // M10b US5: a video episode is recognised once, here, from the feed.
    ...(mediaKindOf(e.enclosureType, e.enclosureUrl) === 'video' ? { mediaKind: 'video' as const } : {}),
  };
}

/**
 * Registers a card as an M3 episode so social data and Next-up have an id; returns the row.
 *
 * M8 (T006): `publishedAt` and `genreId` were already on the card and were being dropped
 * here. Freshness and the category channel both need them, and an absent date must stay
 * NULL — writing `now()` for a feed with no dates would make every such episode look
 * brand new for ever (guard G-F1).
 */
export async function registerCard(db: Db, c: EpisodeCard): Promise<EpisodeRow> {
  return upsertEpisode(db, {
    id: episodeIdOf(c.feedUrl, c.guid), feedUrl: c.feedUrl, guid: c.guid, title: c.title, enclosureUrl: c.enclosureUrl,
    ...(c.showTitle ? { showTitle: c.showTitle } : {}), ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}), ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
    ...(c.publishedAt !== undefined ? { publishedAt: c.publishedAt } : {}), ...(c.genreId !== undefined ? { genreId: c.genreId } : {}),
    ...(c.mediaKind === 'video' ? { mediaKind: 'video' as const } : {}),
  });
}
