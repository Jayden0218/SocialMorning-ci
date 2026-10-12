// Tests the cache: fresh, refetch, stale fallback, deleted keys and invalidated prefixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { cached, deleteCacheKey, invalidateCachePrefix } from '../src/db/repos/cache.ts';

test('cached: fetch once within the TTL; refetch after; a failing refetch serves the stale row; no row + failure throws', async () => {
  const t = await freshDb();
  let clock = 1_000_000; let calls = 0;
  const fetch = async () => { calls++; if (calls === 3) throw new Error('down'); return { n: calls }; };
  const now = () => clock;
  assert.deepEqual(await cached(t.db, 'k', 60_000, fetch, now), { body: { n: 1 }, stale: false });
  assert.deepEqual(await cached(t.db, 'k', 60_000, fetch, now), { body: { n: 1 }, stale: false }); // within TTL: no fetch
  clock += 61_000;
  assert.deepEqual(await cached(t.db, 'k', 60_000, fetch, now), { body: { n: 2 }, stale: false });
  clock += 61_000;
  assert.deepEqual(await cached(t.db, 'k', 60_000, fetch, now), { body: { n: 2 }, stale: true });   // fetch 3 fails → stale copy
  await assert.rejects(cached(t.db, 'other', 60_000, async () => { throw new Error('down'); }, now), /down/);
  assert.equal(calls, 3);
  await t.close();
});

test('M26: a deleted key and an invalidated prefix are misses; other keys stay', async () => {
  const t = await freshDb();
  let n = 0;
  const fetch = async () => ({ n: ++n });
  await cached(t.db, 'discover:v1:a', 60_000, fetch);
  await cached(t.db, 'discover:v1:b', 60_000, fetch);
  await cached(t.db, 'chart:v1:x', 60_000, fetch);
  await cached(t.db, 'feed:https://x', 60_000, fetch);
  assert.equal(n, 4);
  await invalidateCachePrefix(t.db, 'discover:');
  assert.deepEqual(await cached(t.db, 'discover:v1:a', 60_000, fetch), { body: { n: 5 }, stale: false }, 'refetched after the prefix went');
  assert.deepEqual(await cached(t.db, 'discover:v1:b', 60_000, fetch), { body: { n: 6 }, stale: false });
  assert.deepEqual(await cached(t.db, 'chart:v1:x', 60_000, fetch), { body: { n: 3 }, stale: false }, 'another prefix is untouched');
  await deleteCacheKey(t.db, 'feed:https://x');
  assert.deepEqual(await cached(t.db, 'feed:https://x', 60_000, fetch), { body: { n: 7 }, stale: false });
  await t.close();
});
