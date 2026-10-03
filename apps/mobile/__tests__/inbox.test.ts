import { inboxIds } from '../src/inbox';
import { createMemoryStores } from '../src/storage/memory';
import { episodeId } from '../src/storage/schema';
import { hash } from '../src/feeds/hash';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';

const FEED = 'https://feeds.example.com/x.xml';
const show: Show = { feedUrl: FEED, title: 'A Show', explicit: false, categories: [], contentHash: 'h' };
const ep = (guid: string, publishedAt: number): Episode => ({ guid, guidSource: 'guid', title: guid, enclosureUrl: `https://cdn/${guid}.mp3`, publishedAt, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}` });
const parsed = (episodes: Episode[]): ParsedFeed => ({ show, episodes, warnings: [] });

it('reads the inbox from the stores: subscription time, positions, downloads and left reasons all apply', () => {
  const stores = createMemoryStores(hash);
  stores.feeds.put(FEED, parsed([ep('old', 100), ep('new1', 2_000), ep('new2', 3_000), ep('played', 2_500)]), {}, 1);
  stores.subscriptions.add(FEED, 1_000);
  stores.positions.save({ episodeId: episodeId(FEED, 'played', hash), offsetMs: 5, finished: false }, 1);
  expect(inboxIds(stores)).toEqual([episodeId(FEED, 'new2', hash), episodeId(FEED, 'new1', hash)]);
  stores.inboxState.mark(episodeId(FEED, 'new2', hash), 'dismissed', 2);
  expect(inboxIds(stores)).toEqual([episodeId(FEED, 'new1', hash)]);
  stores.subscriptions.remove(FEED);
  expect(inboxIds(stores)).toEqual([]);
});
