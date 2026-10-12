// Extra Discover parts: pick counts, followed shows, new arrivals, what people said, collections.
/**
 * M10 additions to Discover (2026-09-27): per-pick counts, "followed here", "what people
 * said", and the owner's collections. All of it is optional on the wire so an older build
 * keeps working, and none of it names a listener: counts are counts, and a comment
 * carries its author's id, never a display name (guard G6).
 *
 * `followedHere`, `said` and `stats` are live queries — cheap, and a moderation action
 * (remove, suspend, hide) must take effect at once rather than when an hour's cache
 * expires. Collections go through feeds, so they are cached like picks.
 */
import { hash } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { viaStore } from '../../backend.ts';
import { cached, TTL } from '../cache.ts';
import { fetchFeed, registerCard, toCard } from '../../../catalog/feed.ts';
import type { EpisodeCard } from '../../../catalog/apple.ts';
import type { CollectionIn } from '../../../catalog/collections.ts';
import type { DiscoverItem, ItemStats } from './discover.ts';

export type FollowedShow = { feedUrl: string; title: string; imageUrl?: string; author?: string; followers: number };
export type FollowedHere = { total: number; shows: FollowedShow[] };
export type Said = { commentId: string; authorId: string; body: string; createdAt: string; episode: EpisodeCard & { id: string } };
export type Collection = { id: string; title: string; subtitle?: string; items: DiscoverItem[] };

export const FOLLOWED_SHOWN = 9;
export const SAID_SHOWN = 6;
export const SAID_DAYS = 14;
/** At most this many distinct feeds are fetched to rebuild the collections (the function's time budget). */
export const COLLECTION_FEEDS_MAX = 12;

export function withStats(items: readonly DiscoverItem[], stats: ReadonlyMap<string, ItemStats>): DiscoverItem[] {
  return items.map((i) => {
    const s = stats.get(i.episode.id);
    return s ? { ...i, stats: s } : i;
  });
}

export const ARRIVALS_SHOWN = 6;
export type NewArrival = { show: { feedUrl: string; title: string; author: string; imageUrl?: string; genres: string[]; episodeCount: number }; episode: EpisodeCard & { id: string } };

/**
 * The owner's collections, each item resolved exactly like a pick (feedUrl + optional
 * guid; no guid = the show's latest). Cached an hour under a key that carries the file's
 * hash, so an edited collections.json shows on the next request. Feeds are cached per
 * feed already (the seed reuses the picks' feeds), and at most COLLECTION_FEEDS_MAX are
 * touched. A bad item is a warning; a collection left with nothing is dropped.
 */
export async function resolveCollections(db: Db, f: typeof fetch, collections: readonly CollectionIn[]): Promise<{ collections: Collection[]; warnings: string[] }> {
  if (collections.length === 0) return { collections: [], warnings: [] };
  const r = await cached<{ collections: Collection[]; warnings: string[] }>(db, `discover:collections:${hash(JSON.stringify(collections))}`, TTL.discover, async () => {
    const warnings: string[] = [];
    const feeds = new Set<string>();
    const out: Collection[] = [];
    for (const c of collections) {
      const items: DiscoverItem[] = [];
      const keys = new Set<string>();
      for (const it of c.items) {
        if (!feeds.has(it.feedUrl) && feeds.size >= COLLECTION_FEEDS_MAX) { warnings.push(`collection ${c.id}: over ${COLLECTION_FEEDS_MAX} feeds, ${it.feedUrl} skipped`); continue; }
        feeds.add(it.feedUrl);
        try {
          const { feed } = await fetchFeed(db, f, it.feedUrl);
          const episode = it.guid === undefined ? feed.episodes[0] : feed.episodes.find((e) => e.guid === it.guid);
          if (!episode) { warnings.push(`collection ${c.id} ${it.feedUrl} ${it.guid ?? '(show)'}: episode not in the feed`); continue; }
          const card = toCard(it.feedUrl, feed.show, episode);
          const key = `${card.feedUrl}\u0001${card.guid}`;
          if (keys.has(key)) continue;
          keys.add(key);
          const row = await registerCard(db, card);
          items.push({ kind: 'pick', key, episode: { ...card, id: row.id }, ...(it.why !== undefined ? { why: it.why } : {}) });
        } catch (e) {
          warnings.push(`collection ${c.id} ${it.feedUrl}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (items.length > 0) out.push({ id: c.id, title: c.title, ...(c.subtitle !== undefined ? { subtitle: c.subtitle } : {}), items });
      else warnings.push(`collection ${c.id}: no item resolved`);
    }
    return { collections: out, warnings };
  });
  return r.body;
}

/** Serve-time: a hidden show leaves every collection at once; an emptied collection goes. */
export function collectionsWithoutHidden(cols: readonly Collection[], hidden: ReadonlySet<string>, hiddenEps: ReadonlySet<string> = new Set()): Collection[] {
  if (hidden.size === 0 && hiddenEps.size === 0) return [...cols];
  // M24 US11: hidden episodes leave this list.
  return cols.map((c) => ({ ...c, items: c.items.filter((i) => !hidden.has(i.episode.feedUrl) && !hiddenEps.has(i.episode.id)) })).filter((c) => c.items.length > 0);
}

// Each runs its DynamoDB body (ddb/discover-extras.ts) on the Store the Db carries (db/backend.ts).
export const statsFor = viaStore<typeof import('./ddb/discover-extras.ts').statsFor>('dv/discover-extras', 'statsFor');
export const followedHere = viaStore<typeof import('./ddb/discover-extras.ts').followedHere>('dv/discover-extras', 'followedHere');
export const newArrivals = viaStore<typeof import('./ddb/discover-extras.ts').newArrivals>('dv/discover-extras', 'newArrivals');
export const said = viaStore<typeof import('./ddb/discover-extras.ts').said>('dv/discover-extras', 'said');
export const saidByIds = viaStore<typeof import('./ddb/discover-extras.ts').saidByIds>('dv/discover-extras', 'saidByIds');
export const videoEpisodes = viaStore<typeof import('./ddb/discover-extras.ts').videoEpisodes>('dv/discover-extras', 'videoEpisodes');
