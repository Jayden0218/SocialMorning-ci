// Tests the category page's All, Newest and "Not subscribed only" filters.
/** Owner, 2026-10-01: the category page's "All" / "Newest" chips and "Not subscribed only". */
import { appendPage, categoryList, hasMoreAfter, sortCategoryShows, swipeIndex } from '@/discover/category-list';
import type { ShowCard } from '@/social/api';

const show = (feedUrl: string, publishedAt?: string): ShowCard => ({
  feedUrl, title: feedUrl, author: 'A', genres: [],
  latestEpisode: publishedAt === undefined ? { title: 'e' } : { title: 'e', publishedAt },
});
const chart = [
  show('a', '2026-09-01T00:00:00Z'),
  show('b'),
  show('c', '2026-09-30T00:00:00Z'),
  show('d', 'not a date'),
  show('e', '2026-09-15T00:00:00Z'),
  { feedUrl: 'f', title: 'f', author: 'A', genres: [] },
];
const urls = (s: ShowCard[]) => s.map((x) => x.feedUrl);

it('All keeps the chart order and does not mutate the input', () => {
  const out = sortCategoryShows(chart, 'all');
  expect(urls(out)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  expect(out).not.toBe(chart);
});

it('Newest: newest first; missing or bad dates last, in chart order', () => {
  expect(urls(sortCategoryShows(chart, 'newest'))).toEqual(['c', 'e', 'a', 'b', 'd', 'f']);
  expect(urls(chart)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
});

it('Newest: equal dates keep chart order', () => {
  const same = [show('x', '2026-09-01T00:00:00Z'), show('y', '2026-09-01T00:00:00Z')];
  expect(urls(sortCategoryShows(same, 'newest'))).toEqual(['x', 'y']);
});

it('Not subscribed only hides followed shows; off shows them all', () => {
  const subscribed = new Set(['c', 'a']);
  expect(urls(categoryList(chart, { sort: 'newest', notSubscribedOnly: true, subscribed }))).toEqual(['e', 'b', 'd', 'f']);
  expect(urls(categoryList(chart, { sort: 'all', notSubscribedOnly: false, subscribed }))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
});

test('owner 2026-10-05: a new page is added after the loaded shows, a show already there is not added again', () => {
  const next = appendPage([show('a'), show('b')], [show('b'), show('c'), show('c'), show('d')]);
  expect(next.map((s) => s.feedUrl)).toEqual(['a', 'b', 'c', 'd']);
});

test('owner 2026-10-05: hasMore from the server wins; a list kept without it counts as more when full (20)', () => {
  const full = Array.from({ length: 20 }, (_, i) => show(`s${i}`));
  expect(hasMoreAfter({ shows: full, hasMore: false })).toBe(false);
  expect(hasMoreAfter({ shows: [show('a')], hasMore: true })).toBe(true);
  expect(hasMoreAfter({ shows: full })).toBe(true);
  expect(hasMoreAfter({ shows: full.slice(0, 19) })).toBe(false);
});

test('owner 2026-10-05: a swipe of the category row maps evenly onto the 19 categories, ends included', () => {
  expect(swipeIndex(0, 1000, 19)).toBe(0);
  expect(swipeIndex(1000, 1000, 19)).toBe(18);
  expect(swipeIndex(500, 1000, 19)).toBe(9);
  expect(swipeIndex(-40, 1000, 19)).toBe(0); // overscroll at the start
  expect(swipeIndex(1200, 1000, 19)).toBe(18); // and at the end
  expect(swipeIndex(300, 0, 19)).toBe(0); // a row that does not scroll
});
