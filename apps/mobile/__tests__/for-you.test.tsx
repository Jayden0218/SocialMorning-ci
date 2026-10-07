// Tests the For You last copy: the cached copy is marked, and a sign-out forgets it.
/**
 * M8 US2 (quickstart A20) — the For You list's last copy. (M23 US12: the old For You section
 * component was never mounted and was deleted with its render tests.)
 *
 * Nothing left behind after a sign-out (the cache is per listener), and nothing silently
 * pretending to be current when it came from the cache (FR-020).
 */
import { createForYou, FOR_YOU_KEY } from '@/recs/cache';
import { ApiError, type ForYou as ForYouBody } from '@/social/api';
import type { FeedCacheRow, FeedCacheStore } from '@/storage/types';


const episode = (id: string, title: string) => ({ id, feedUrl: `https://f/${id}`, guid: id, title, showTitle: 'Reply All', enclosureUrl: `https://cdn/${id}.mp3` });

const body = (n = 2): ForYouBody => ({
  items: Array.from({ length: n }, (_, i) => ({
    episode: episode(`e${i}`, `Episode ${i}`),
    channel: i === 0 ? ('pick' as const) : ('showcf' as const),
    reason: i === 0 ? 'Picked today' : 'Because you follow 99% Invisible',
    score: 3 - i,
  })),
  computedAt: '2026-09-25T12:00:00.000Z',
  stale: false,
  similarityAge: 4,
  serverTime: '2026-09-25T12:00:01.000Z',
});

function memoryCache(): FeedCacheStore & { rows: Map<string, FeedCacheRow> } {
  const rows = new Map<string, FeedCacheRow>();
  return { rows, get: (k) => rows.get(k), set: (row) => void rows.set(row.key, row) };
}

describe('the last copy', () => {
  const api = (impl: Partial<{ forYou: jest.Mock }>) => ({ forYou: jest.fn(), ...impl }) as never;

  it('A20: with no connection the cached copy is served and marked not current', async () => {
    const cache = memoryCache();
    const f = createForYou({ api: api({ forYou: jest.fn(async () => ({ status: 200 as const, etag: 'W/"1"', body: body(2) })) }), cache, now: () => 1000 });
    expect(await f.refresh()).toMatchObject({ stale: false, fetchedAt: 1000 });

    const offline = createForYou({
      api: api({ forYou: jest.fn(async () => { throw new ApiError('network', 'no', 0); }) }),
      cache, now: () => 2000,
    });
    const v = await offline.refresh();
    expect(v?.stale).toBe(true);
    expect(v?.body.items).toHaveLength(2);
    expect(offline.cached()?.stale).toBe(true);
  });

  it('304 keeps the copy and stops calling it stale', async () => {
    const cache = memoryCache();
    const first = createForYou({ api: api({ forYou: jest.fn(async () => ({ status: 200 as const, etag: 'W/"1"', body: body(1) })) }), cache, now: () => 1000 });
    await first.refresh();
    const again = createForYou({ api: api({ forYou: jest.fn(async () => ({ status: 304 as const })) }), cache, now: () => 5000 });
    expect(await again.refresh()).toMatchObject({ stale: false, fetchedAt: 1000 });
  });

  it('signed out, or nothing cached and no connection, gives no section rather than an error', async () => {
    const cache = memoryCache();
    const out = createForYou({ api: api({ forYou: jest.fn(async () => { throw new ApiError('unauthenticated', 'sign in', 401); }) }), cache, now: () => 1 });
    expect(await out.refresh()).toBeUndefined();
    const down = createForYou({ api: api({ forYou: jest.fn(async () => { throw new ApiError('network', 'no', 0); }) }), cache, now: () => 1 });
    expect(await down.refresh()).toBeUndefined();
    // Anything else is a real bug and must not be swallowed.
    const boom = createForYou({ api: api({ forYou: jest.fn(async () => { throw new Error('boom'); }) }), cache, now: () => 1 });
    await expect(boom.refresh()).rejects.toThrow('boom');
  });

  it('sign-out forgets the list: the next listener never sees the last one\'s recommendations', async () => {
    const cache = memoryCache();
    const f = createForYou({ api: api({ forYou: jest.fn(async () => ({ status: 200 as const, body: body(2) })) }), cache, now: () => 1000 });
    await f.refresh();
    expect(f.cached()?.body.items).toHaveLength(2);
    f.forget();
    expect(f.cached()).toBeUndefined();
    expect(cache.rows.get(FOR_YOU_KEY)?.body).toBe('');
  });
});
