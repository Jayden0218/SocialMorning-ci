/** quickstart A9: library hits at once over a seeded cache; a feed URL is recognised; unsubscribed shows are not searched. */
import { looksLikeFeedUrl, searchLibrary } from '../src/discover/local-search';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';

const FEED = 'https://feeds.megaphone.fm/replyall';
const show: Show = { feedUrl: FEED, title: 'Reply All', author: 'Gimlet', explicit: false, categories: ['Technology'], contentHash: 'h', imageUrl: 'https://img/ra.png' };
const ep = (guid: string, title: string): Episode => ({ guid, guidSource: 'guid', title, enclosureUrl: `https://cdn/${guid}.mp3`, explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}`, durationMs: 2_057_000, publishedAt: Date.UTC(2024, 11, 5) });
const parsed = (eps: Episode[]): ParsedFeed => ({ show, episodes: eps, warnings: [] });

it('A9: a subscribed show and its episodes match by tokens; unsubscribed cached shows do not; a URL is recognised', () => {
  const stores = createMemoryStores(hash);
  stores.feeds.put(FEED, parsed([ep('g1', 'Casey Wants to Believe'), ep('g2', '#189 Goodbye All')]), {}, 1);
  stores.feeds.put('https://other/x.xml', { show: { ...show, feedUrl: 'https://other/x.xml', title: 'Casey Fan Show' }, episodes: [ep('o1', 'Casey again')], warnings: [] }, {}, 1);
  stores.subscriptions.add(FEED, 1);
  const hits = searchLibrary(stores, 'casey believe');
  expect(hits.shows).toEqual([]);
  expect(hits.episodes.map((e) => e.title)).toEqual(['Casey Wants to Believe']);
  expect(hits.episodes[0]).toMatchObject({ feedUrl: FEED, guid: 'g1', showTitle: 'Reply All', imageUrl: 'https://img/ra.png', durationMs: 2_057_000, publishedAt: '2024-12-05T00:00:00.000Z' });
  const byShow = searchLibrary(stores, 'gimlet');
  expect(byShow.shows.map((s) => s.title)).toEqual(['Reply All']);
  expect(byShow.shows[0]).toMatchObject({ author: 'Gimlet', genres: ['Technology'] });
  expect(searchLibrary(stores, 'nothing here')).toEqual({ shows: [], episodes: [] });
  expect(looksLikeFeedUrl(' https://feeds.example.com/x.xml ')).toBe(true);
  expect(looksLikeFeedUrl('reply all')).toBe(false);
});
