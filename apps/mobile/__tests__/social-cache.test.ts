// Tests that cached social data saves and loads with its ETag, even if corrupt.
import { createSocialCache } from '@/social/cache';
import { createMemorySocialCacheStore } from '@/storage/memory';
import type { Social } from '@/social/api';

const social: Social = { serverTime: 's', episode: { id: 'e', durationMs: 100 }, comments: [], heat: { available: false } };

it('round-trips a social response with its etag and survives a corrupt row', () => {
  const store = createMemorySocialCacheStore();
  const cache = createSocialCache(store);
  cache.put('e', social, '"v1"', 5);
  expect(cache.get('e')).toEqual({ social, etag: '"v1"', fetchedAt: 5 });
  store.put({ episodeId: 'e', fetchedAt: 6, bodyJson: '{not json' });
  expect(cache.get('e')).toBeUndefined();
});
