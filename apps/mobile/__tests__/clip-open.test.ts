/** T014: a clip link's episode is found in the cache, else the feed, else the server's record. */
import { resolveClipEpisode } from '../src/graph/resolve';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';
import { episodeId } from '../src/storage/schema';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import type { EpisodeRecord } from '../src/social/api';

const FEED = 'https://feeds.example.com/x.xml';
const show: Show = { feedUrl: FEED, title: 'Reply All', explicit: false, categories: [], contentHash: 'h', imageUrl: 'https://img/show.png' };
const ep = (guid: string): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}`, durationMs: 2_000_000 });
const parsed = (episodes: Episode[]): ParsedFeed => ({ show, episodes, warnings: [] });
const ID = episodeId(FEED, 'g1', hash);
const record: EpisodeRecord = { id: ID, feedUrl: FEED, guid: 'g1', title: 'server title', showTitle: 'Reply All', enclosureUrl: 'https://cdn/g1.mp3', imageUrl: null, durationMs: 1_999_000 };

it('cache first: an episode already in the library is used, and its download if complete', async () => {
  const stores = createMemoryStores(hash);
  stores.feeds.put(FEED, parsed([ep('g1')]), {}, 1);
  stores.downloads.put({ episodeId: ID, filePath: '/dl/g1.mp3', state: 'complete', bytesDone: 1, bytesTotal: 1, allowMobile: false, requestedAt: 1 });
  let fetched = 0;
  const r = await resolveClipEpisode({ stores, refreshShow: async () => { fetched++; } }, record);
  expect(r.via).toBe('cache');
  expect(r.episode).toMatchObject({ id: ID, url: '/dl/g1.mp3', title: 'g1', showTitle: 'Reply All', durationMs: 2_000_000 });
  expect(fetched).toBe(0);
});

it('feed second: an unknown show is fetched (not subscribed) and the guid found', async () => {
  const stores = createMemoryStores(hash);
  const r = await resolveClipEpisode({ stores, refreshShow: async (url) => { stores.feeds.put(url, parsed([ep('g1')]), {}, 1); } }, record);
  expect(r.via).toBe('feed');
  expect(r.episode).toMatchObject({ id: ID, url: 'https://cdn/g1.mp3', title: 'g1' });
  expect(stores.subscriptions.has(FEED)).toBe(false);
});

it('server last: a feed that no longer lists the guid, or cannot be fetched, yields the record itself', async () => {
  const stores = createMemoryStores(hash);
  const gone = await resolveClipEpisode({ stores, refreshShow: async (url) => { stores.feeds.put(url, parsed([ep('g2')]), {}, 1); } }, record);
  expect(gone.via).toBe('server');
  expect(gone.episode).toEqual({ id: ID, url: 'https://cdn/g1.mp3', title: 'server title', showTitle: 'Reply All', durationMs: 1_999_000, feedUrl: FEED });
  const offline = await resolveClipEpisode({ stores: createMemoryStores(hash), refreshShow: async () => { throw new Error('offline'); } }, { ...record, showTitle: null, imageUrl: 'https://img/e.png', durationMs: null });
  expect(offline.via).toBe('server');
  expect(offline.episode).toEqual({ id: ID, url: 'https://cdn/g1.mp3', title: 'server title', showTitle: '', artworkUrl: 'https://img/e.png', feedUrl: FEED });
});
