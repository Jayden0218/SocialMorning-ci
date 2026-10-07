// Tests deleting from listening history on the phone: hidden rows, clear all, and deletes made on another phone.
/**
 * M22 US8 (FR-026). The position stays (it is the resume point); the history row is hidden
 * until the episode is played again.
 *
 * The break that turns it red: drop the `shown` filter from `listeningHistory`
 * (src/me/history.ts), or hide unsynced rows in `hideDeletedElsewhere`.
 */
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';
import { hash } from '@/feeds/hash';
import { HIDDEN_KEY, hideDeletedElsewhere, hideFromHistory, listeningHistory, readHidden } from '@/me/history';
import { createMemoryStores } from '@/storage/memory';
import { episodeId } from '@/storage/schema';

const F = 'https://f/h.xml';
const show: Show = { feedUrl: F, title: 'H', explicit: false, categories: [], contentHash: 'h' };
const ep = (guid: string): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}` });
const feed: ParsedFeed = { show, episodes: ['a', 'b', 'c'].map(ep), warnings: [] };
const id = (g: string) => episodeId(F, g, hash);

function setup() {
  const stores = createMemoryStores(hash);
  stores.feeds.put(F, feed, {}, 1);
  stores.positions.save({ episodeId: id('a'), offsetMs: 1_000, finished: false }, 100);
  stores.positions.save({ episodeId: id('b'), offsetMs: 2_000, finished: false }, 200);
  stores.positions.save({ episodeId: id('c'), offsetMs: 3_000, finished: true }, 300);
  return stores;
}
const titles = (stores: ReturnType<typeof setup>) => listeningHistory(stores).map((r) => r.episode.title);

it('deleted rows are hidden, the positions stay, and playing again brings a row back', () => {
  const stores = setup();
  expect(titles(stores)).toEqual(['c', 'b', 'a']);
  hideFromHistory(stores.settings, [id('a'), id('c')], 400);
  expect(titles(stores)).toEqual(['b']);
  expect(stores.positions.get(id('a'))?.offsetMs).toBe(1_000);
  stores.positions.save({ episodeId: id('a'), offsetMs: 5_000, finished: false }, 500);
  expect(titles(stores)).toEqual(['a', 'b']);
  hideFromHistory(stores.settings, [], 600); // nothing chosen: nothing written
  expect(Object.keys(readHidden(stores.settings)).sort()).toEqual([id('a'), id('c')].sort());
});

it('clear all hides every row', () => {
  const stores = setup();
  hideFromHistory(stores.settings, stores.positions.all().map((p) => p.episodeId), 1_000);
  expect(titles(stores)).toEqual([]);
});

it('a delete on another phone: synced rows the account lost are hidden, unsynced ones stay', () => {
  const stores = setup();
  stores.positions.markSynced(id('a'), 1);
  stores.positions.markSynced(id('b'), 1);
  // The account still has b; a was deleted elsewhere; c was never uploaded.
  expect(hideDeletedElsewhere(stores.settings, stores.positions.all(), new Set([id('b')]), 900)).toBe(1);
  expect(titles(stores)).toEqual(['c', 'b']);
  // Again: nothing new to hide.
  expect(hideDeletedElsewhere(stores.settings, stores.positions.all(), new Set([id('b')]), 950)).toBe(0);
});

it('a broken saved list reads as nothing hidden', () => {
  const stores = setup();
  stores.settings.set(HIDDEN_KEY, 'not json');
  expect(readHidden(stores.settings)).toEqual({});
  stores.settings.set(HIDDEN_KEY, '[1,2]');
  expect(readHidden(stores.settings)).toEqual({});
  stores.settings.set(HIDDEN_KEY, JSON.stringify({ x: 'no', y: 5 }));
  expect(readHidden(stores.settings)).toEqual({ y: 5 });
  expect(titles(stores)).toEqual(['c', 'b', 'a']);
});
