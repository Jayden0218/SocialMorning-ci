/** Owner, 2026-10-01: the category page's "All" / "Newest" chips and "Not subscribed only". */
import { categoryList, sortCategoryShows } from '../src/discover/category-list';
import type { ShowCard } from '../src/social/api';

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
