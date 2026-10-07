// Tests that downloads tidy themselves: delete after playing, and remove the oldest when storage is full.
/**
 * M22 US17 (spec item 4): two switches, both off by default. Starred and part-listened
 * downloads are never removed automatically.
 *
 * The break that turns it red: drop `keep` from `evictionPlan`'s filter in
 * src/downloads/manager.ts (a starred download is removed), or ignore the switch in `afterFinished`.
 */
import { createDownloadManager, evictionPlan, SETTING_BUDGET } from '@/downloads/manager';
import type { Downloader, DownloadRow, Network } from '@/downloads/types';
import { createMemoryStores } from '@/storage/memory';
import { episodeId } from '@/storage/schema';
import { hash } from '@/feeds/hash';
import { toggleFavourite } from '@/me/favourites';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';

const FEED = 'https://feeds.example.com/t.xml';
const show: Show = { feedUrl: FEED, title: 'Tidy', explicit: false, categories: [], contentHash: 'h' };
const ep = (guid: string): Episode => ({
  guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn.example.com/${guid}.mp3`, enclosureBytes: 100,
  explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}`,
});
const parsed = (episodes: Episode[]): ParsedFeed => ({ show, episodes, warnings: [] });
const id = (guid: string) => episodeId(FEED, guid, hash);

function build() {
  const stores = createMemoryStores(hash);
  stores.feeds.put(FEED, parsed(['a', 'b', 'c', 'd'].map(ep)), {}, 1);
  const removed: string[] = [];
  const downloader: Downloader = {
    async start(_row, _url, onProgress) { onProgress(100, 100); return {}; },
    async pause() { return undefined; },
    async cancel() { /* nothing */ },
    async remove(path) { removed.push(path); },
    async size() { return 100; },
  };
  const network: Network = { kind: async () => 'wifi' };
  const manager = createDownloadManager({ downloader, network, stores, now: () => 1, pathFor: (e) => `/d/${e}.mp3` });
  /** A complete 100-byte download finished at `at`. */
  const complete = (guid: string, at: number) => stores.downloads.put({ episodeId: id(guid), filePath: `/d/${id(guid)}.mp3`, state: 'complete', bytesDone: 100, bytesTotal: 100, allowMobile: false, requestedAt: at, completedAt: at });
  return { stores, manager, removed, complete };
}

it('both switches are off by default', () => {
  const { manager } = build();
  expect(manager.deleteAfterPlay()).toBe(false);
  expect(manager.evictOldest()).toBe(false);
});

it('delete after playing: a finished episode loses its download only when the switch is on', () => {
  const { stores, manager, removed, complete } = build();
  complete('a', 1);
  manager.afterFinished(id('a'));
  expect(stores.downloads.get(id('a'))?.state).toBe('complete');
  manager.setDeleteAfterPlay(true);
  manager.afterFinished(id('a'));
  expect(stores.downloads.get(id('a'))).toBeUndefined();
  expect(removed).toEqual([`/d/${id('a')}.mp3`]);
  manager.afterFinished(id('zz')); // nothing downloaded: nothing happens
  expect(removed).toHaveLength(1);
});

it('storage full: off refuses; on removes the oldest that is neither starred nor part-listened', async () => {
  const { stores, manager, removed, complete } = build();
  stores.settings.set(SETTING_BUDGET, '300');
  complete('a', 1); // oldest, starred
  complete('b', 2); // listened part-way
  complete('c', 3); // the one that may go
  toggleFavourite(stores.settings, id('a'), 5);
  stores.positions.save({ episodeId: id('b'), offsetMs: 60_000, finished: false }, 5);
  expect((await manager.request(id('d'))).kind).toBe('budget');
  manager.setEvictOldest(true);
  expect((await manager.request(id('d'))).kind).toBe('queued');
  expect(removed).toEqual([`/d/${id('c')}.mp3`]);
  expect(stores.downloads.get(id('a'))?.state).toBe('complete');
  expect(stores.downloads.get(id('b'))?.state).toBe('complete');
});

it('evictionPlan: oldest first, only as many as needed, nothing when it cannot fit', () => {
  const row = (e: string, at: number): DownloadRow => ({ episodeId: e, filePath: e, state: 'complete', bytesDone: 100, bytesTotal: 100, allowMobile: false, requestedAt: at, completedAt: at });
  const rows = [row('new', 3), row('old', 1), row('mid', 2)];
  const none = () => false;
  expect(evictionPlan(rows, 100, 400, none)).toEqual([]);
  expect(evictionPlan(rows, 100, 300, none)).toEqual(['old']);
  expect(evictionPlan(rows, 200, 300, none)).toEqual(['old', 'mid']);
  expect(evictionPlan(rows, 100, 300, (e) => e === 'old')).toEqual(['mid']);
  expect(evictionPlan(rows, 500, 300, none)).toEqual([]);
});
