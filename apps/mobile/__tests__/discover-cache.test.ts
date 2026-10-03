import { createDiscover } from '../src/discover/cache';
import { resolveCard } from '../src/discover/open';
import { ApiError, type ApiClient, type Discover, type EpisodeCard } from '../src/social/api';
import { createMemoryFeedCacheStore, createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';
import { episodeId } from '../src/storage/schema';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';

const body = (stale = false): Discover => ({ date: '2026-09-22', picks: [], talkedAbout: [], trending: [], stale, serverTime: 'x' });

it('discover cache: fetch → cached with etag; 304 keeps the copy; offline → the copy stale; offline with no copy → undefined', async () => {
  let online = true; let etag = 'W/"1"'; const seen: (string | undefined)[] = [];
  const api = { discover: async (inm?: string) => { seen.push(inm); if (!online) throw new ApiError('network', 'no', 0); if (inm === etag) return { status: 304 as const }; return { status: 200 as const, etag, body: body() }; } } as unknown as ApiClient;
  const d = createDiscover({ api, cache: createMemoryFeedCacheStore(), now: () => 7 });
  expect(d.cached()).toBeUndefined();
  expect(await d.refresh()).toEqual({ body: body(), stale: false, fetchedAt: 7 });
  expect(await d.refresh()).toEqual({ body: body(), stale: false, fetchedAt: 7 });
  expect(seen).toEqual([undefined, 'W/"1"']);
  online = false;
  expect((await d.refresh())?.stale).toBe(true);
  expect(d.cached()?.stale).toBe(true);
  const fresh = createDiscover({ api, cache: createMemoryFeedCacheStore(), now: () => 7 });
  expect(await fresh.refresh()).toBeUndefined();
});

const FEED = 'https://feeds.example.com/x.xml';
const show: Show = { feedUrl: FEED, title: 'S', explicit: false, categories: [], contentHash: 'h' };
const ep = (guid: string): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}` });
const parsed = (eps: Episode[]): ParsedFeed => ({ show, episodes: eps, warnings: [] });
const card: EpisodeCard = { id: episodeId(FEED, 'g1', hash), feedUrl: FEED, guid: 'g1', title: 'g1', showTitle: 'S', enclosureUrl: 'https://cdn/g1.mp3' };

it('resolveCard: cache → feed → not_in_feed / offline; the show is not subscribed', async () => {
  const stores = createMemoryStores(hash);
  expect(await resolveCard({ stores, refreshShow: async (u) => { stores.feeds.put(u, parsed([ep('g1')]), {}, 1); } }, card)).toEqual({ episodeId: card.id, via: 'feed' });
  expect(await resolveCard({ stores, refreshShow: async () => { throw new Error('should not fetch'); } }, card)).toEqual({ episodeId: card.id, via: 'cache' });
  expect(stores.subscriptions.has(FEED)).toBe(false);
  const empty = createMemoryStores(hash);
  expect(await resolveCard({ stores: empty, refreshShow: async (u) => { empty.feeds.put(u, parsed([ep('g2')]), {}, 1); } }, card)).toEqual({ episodeId: undefined, reason: 'not_in_feed' });
  expect(await resolveCard({ stores: createMemoryStores(hash), refreshShow: async () => { throw new Error('offline'); } }, card)).toEqual({ episodeId: undefined, reason: 'offline' });
});
