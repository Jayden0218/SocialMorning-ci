/**
 * A feed, parsed server-side (M5 research R3/R5): for show picks ("its latest episode"),
 * "new on this show", and the category behind "trending in". Cached 1 h; the parser never
 * throws for a bad item (principle IV).
 */
import { parseFeed, type Episode, type ParsedFeed } from '@socialmorning/feed-parser';
import { hash } from '@socialmorning/social-core';
import type { Db } from '../db/db.ts';
import { cached, TTL } from '../db/repos/cache.ts';
import { upsertEpisode, type EpisodeRow } from '../db/repos/episodes.ts';
import type { EpisodeCard } from './apple.ts';
import { genreIdFor } from './genres.ts';

export const USER_AGENT = 'SocialMorning/0.1 (+https://socialmorning-api.vercel.app)';

export type FetchedFeed = { show: ParsedFeed['show']; episodes: Episode[]; warnings: ParsedFeed['warnings'] };

export async function fetchFeed(db: Db, f: typeof fetch, feedUrl: string): Promise<{ feed: FetchedFeed; stale: boolean }> {
  const r = await cached<FetchedFeed>(db, `feed:${feedUrl}`, TTL.feed, async () => {
    // Seen live 2026-09-22: feeds.podcastindex.org answers 403 to a fetch with no User-Agent (the
    // phone's fetch sends one). Name the app, as any polite feed reader does.
    const res = await f(feedUrl, { headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': USER_AGENT } });
    if (!res.ok) throw new Error(`feed ${feedUrl}: ${res.status}`);
    const parsed = parseFeed(await res.text(), feedUrl, { hash });
    return { show: parsed.show, episodes: parsed.episodes.slice(0, 50), warnings: parsed.warnings };
  });
  return { feed: r.body, stale: r.stale };
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
  });
}
