import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { cached } from '../src/db/repos/cache.ts';

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
