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

export type FetchedFeed = { show: ParsedFeed['show']; episodes: Episode[]; warnings: ParsedFeed['warnings'] };

export async function fetchFeed(db: Db, f: typeof fetch, feedUrl: string): Promise<{ feed: FetchedFeed; stale: boolean }> {
  const r = await cached<FetchedFeed>(db, `feed:${feedUrl}`, TTL.feed, async () => {
    const res = await f(feedUrl, { headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
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
  return {
    feedUrl, guid: e.guid, title: e.title, showTitle: show.title, enclosureUrl: e.enclosureUrl,
    ...(imageUrl ? { imageUrl } : {}), ...(e.durationMs !== undefined ? { durationMs: e.durationMs } : {}),
    ...(e.publishedAt !== undefined ? { publishedAt: new Date(e.publishedAt).toISOString() } : {}),
  };
}

/** Registers a card as an M3 episode so social data and Next-up have an id; returns the row. */
export async function registerCard(db: Db, c: EpisodeCard): Promise<EpisodeRow> {
  return upsertEpisode(db, {
    id: episodeIdOf(c.feedUrl, c.guid), feedUrl: c.feedUrl, guid: c.guid, title: c.title, enclosureUrl: c.enclosureUrl,
    ...(c.showTitle ? { showTitle: c.showTitle } : {}), ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}), ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
  });
}
