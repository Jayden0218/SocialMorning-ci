// Tests that a category's last list is kept, shared while fetching, and not re-fetched while fresh.
import { cachedCategory, categoryKey, fetchCategory, forgetCategories, warmCategories, WARM_FRESH_MS } from '@/discover/category-cache';
import type { ApiClient, CategoryShows } from '@/social/api';
import { createMemoryFeedCacheStore } from '@/storage/memory';
import { Image } from 'react-native';

// Replacing all of react-native breaks jest-expo's setup; only the cover prefetch is stubbed.
jest.spyOn(Image, 'prefetch').mockResolvedValue(true);

const list = (genreId: number, title = 'A'): CategoryShows => ({ genreId, name: 'Business', shows: [{ feedUrl: `https://f/${title}`, title, author: 'x', genres: [], imageUrl: 'https://i/1.jpg' }] });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(forgetCategories);

it('G-CC1: a fetched list is kept on the phone — a new launch (memory cleared) draws it before any fetch', async () => {
  const cache = createMemoryFeedCacheStore();
  const api = { category: async (id: number) => list(id) } as unknown as ApiClient;
  expect(cachedCategory(cache, 1321)).toBeUndefined();
  await fetchCategory({ api, cache, now: () => 5 }, 1321);
  forgetCategories();
  expect(cachedCategory(cache, 1321)).toEqual(list(1321));
  expect(cache.get(categoryKey(1321))?.fetchedAt).toBe(5);
});

it('two opens while one fetch runs share it; a broken kept row is ignored', async () => {
  const cache = createMemoryFeedCacheStore();
  let calls = 0;
  const api = { category: async (id: number) => { calls += 1; return list(id); } } as unknown as ApiClient;
  const deps = { api, cache, now: () => 1 };
  await Promise.all([fetchCategory(deps, 1), fetchCategory(deps, 1)]);
  expect(calls).toBe(1);
  cache.set({ key: categoryKey(2), fetchedAt: 1, body: '{"no":1}' });
  expect(cachedCategory(cache, 2)).toBeUndefined();
});

it('warm fetches what is missing or older than 10 minutes, and drops errors', async () => {
  const cache = createMemoryFeedCacheStore();
  const asked: number[] = [];
  const api = { category: async (id: number) => { asked.push(id); if (id === 9) throw new Error('down'); return list(id); } } as unknown as ApiClient;
  let now = 1000;
  await fetchCategory({ api, cache, now: () => now }, 1);
  asked.length = 0;
  warmCategories({ api, cache, now: () => now }, [1, 2, 9]);
  await flush();
  expect(asked).toEqual([2, 9]);
  now += WARM_FRESH_MS;
  asked.length = 0;
  warmCategories({ api, cache, now: () => now }, [1]);
  await flush();
  expect(asked).toEqual([1]);
});
