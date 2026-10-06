// Tests Clear cache: the size shown first is what is freed, and downloads and launch images are never touched.
/**
 * M21 US10 (T109, spec US10 scenario 1): the size shown first matches what is freed, and
 * downloads are untouched.
 * The break that turns it red: drop the `KEEP` check in `clearCache` (src/storage/clear-cache.ts)
 * — the `downloads` and `launch` entries are deleted.
 */
jest.mock('expo-file-system', () => ({ Directory: class {}, Paths: {} }));

import { cacheBytes, clearCache, sizeLabel, type CacheEntry } from '@/storage/clear-cache';
import { createMemoryFeedCacheStore, createMemorySocialCacheStore } from '@/storage/memory';

function entries(): { list: CacheEntry[]; removed: string[] } {
  const removed: string[] = [];
  const e = (name: string, size: number, fails = false): CacheEntry => ({ name, size, remove: () => { if (fails) throw new Error('busy'); removed.push(name); } });
  return { list: [e('image_cache', 300_000), e('share-1.png', 50_000), e('launch', 900_000), e('downloads', 5_000_000), e('busy.db', 1_000, true)], removed };
}

it('measures first, frees the same, and keeps downloads and launch images', () => {
  const stores = { socialCache: createMemorySocialCacheStore(), feedCache: createMemoryFeedCacheStore() };
  stores.socialCache.put({ episodeId: 'e1', fetchedAt: 1, bodyJson: 'x'.repeat(2_000) });
  stores.feedCache.set({ key: 'discover', fetchedAt: 1, body: 'y'.repeat(3_000) });

  const { list, removed } = entries();
  const shown = cacheBytes(list, stores);
  expect(shown).toBe(300_000 + 50_000 + 1_000 + 2_000 + 3_000);
  const freed = clearCache(list, stores);
  expect(removed).toEqual(['image_cache', 'share-1.png']);
  expect(removed).not.toContain('downloads');
  expect(removed).not.toContain('launch');
  // Only the busy file stayed: within 10 % of what was shown.
  expect(freed).toBe(shown - 1_000);
  expect(Math.abs(shown - freed) / shown).toBeLessThan(0.1);
  expect(stores.socialCache.get('e1')).toBeUndefined();
  expect(stores.feedCache.get('discover')).toBeUndefined();
  expect(cacheBytes([], stores)).toBe(0);
});

it('says the size in KB below a megabyte', () => {
  expect(sizeLabel(0)).toBe('0 KB');
  expect(sizeLabel(320 * 1024)).toBe('320 KB');
  expect(sizeLabel(4.2 * 1024 * 1024)).toBe('4.2 MB');
  expect(sizeLabel(1.1 * 1024 * 1024 * 1024)).toBe('1.1 GB');
});
