/**
 * quickstart A21 / FR-032: with a cached copy and the server unreachable, the
 * social view is the cached one and it is flagged stale. Exercised on the pure
 * pieces (cache + the refresh rule) — the provider's `refresh` follows the same
 * rule and is reviewed, not tested, until the device row S5.
 */
import { createSocialCache } from '../src/social/cache';
import { createMemorySocialCacheStore } from '../src/storage/memory';
import { ApiError, type ApiClient, type Social } from '../src/social/api';

const social: Social = { serverTime: 's', episode: { id: 'e', durationMs: 100 }, comments: [{ id: 'c', authorId: 'a', displayName: 'A', body: 'x', offsetMs: 10, parentId: null, createdAt: 'now', deleted: false }], heat: { available: false } };

/** The same logic as SocialProvider.refresh, extracted so it runs here. */
async function refresh(api: Pick<ApiClient, 'social'>, cache: ReturnType<typeof createSocialCache>, episodeId: string) {
  try {
    const r = await api.social(episodeId, cache.get(episodeId)?.etag);
    if (r.status === 200) cache.put(episodeId, r.body, r.etag, 1);
    return { social: r.status === 200 ? r.body : cache.get(episodeId)?.social, stale: false };
  } catch {
    return { social: cache.get(episodeId)?.social, stale: true };
  }
}

it('A21: server unreachable → cached comments rendered, stale flag set; never fetched → nothing, still stale', async () => {
  const cache = createSocialCache(createMemorySocialCacheStore());
  const up: Pick<ApiClient, 'social'> = { social: async () => ({ status: 200, etag: '"v1"', body: social }) };
  const down: Pick<ApiClient, 'social'> = { social: async () => { throw new ApiError('network', 'down', 0); } };

  expect(await refresh(down, cache, 'never')).toEqual({ social: undefined, stale: true });
  expect(await refresh(up, cache, 'e')).toEqual({ social, stale: false });
  const offline = await refresh(down, cache, 'e');
  expect(offline.stale).toBe(true);
  expect(offline.social?.comments).toHaveLength(1);
});

it('a 304 keeps the cached body and clears stale', async () => {
  const cache = createSocialCache(createMemorySocialCacheStore());
  cache.put('e', social, '"v1"', 0);
  const notModified: Pick<ApiClient, 'social'> = { social: async (_id, etag) => { expect(etag).toBe('"v1"'); return { status: 304 }; } };
  expect(await refresh(notModified, cache, 'e')).toEqual({ social, stale: false });
});
