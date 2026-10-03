import { toPlayable } from '../src/storage/playable';
import { createMemoryStores } from '../src/storage/memory';
import { episodeId } from '../src/storage/schema';
import { hash } from '../src/feeds/hash';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';

const FEED = 'https://feeds.example.com/x.xml';
const show: Show = { feedUrl: FEED, title: 'A Show', explicit: false, categories: [], contentHash: 'h' };
const ep: Episode = { guid: 'g', guidSource: 'guid', title: 'T', enclosureUrl: 'https://cdn/x.mp3', explicit: false, transcripts: [], soundbites: [], contentHash: 'h' };
const parsed: ParsedFeed = { show, episodes: [ep], warnings: [] };

it('FR-003 / FR-007: a complete download with its file present plays from file://; otherwise the stream', () => {
  const stores = createMemoryStores(hash);
  stores.feeds.put(FEED, parsed, {}, 1);
  const id = episodeId(FEED, 'g', hash);
  expect(toPlayable(stores, id)?.url).toBe('https://cdn/x.mp3');
  stores.downloads.put({ episodeId: id, filePath: 'file:///d/x.mp3', state: 'downloading', bytesDone: 1, allowMobile: false, requestedAt: 1 });
  expect(toPlayable(stores, id)?.url).toBe('https://cdn/x.mp3');
  stores.downloads.put({ episodeId: id, filePath: 'file:///d/x.mp3', state: 'complete', bytesDone: 9, bytesTotal: 9, allowMobile: false, requestedAt: 1 });
  expect(toPlayable(stores, id)?.url).toBe('file:///d/x.mp3');
  expect(toPlayable(stores, id, () => false)?.url).toBe('https://cdn/x.mp3');
});
