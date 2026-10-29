// Tests M32 lane GA (verification finding 2): a pool read from the snapshot keeps the snapshot's build time.
/**
 * Guard (break -> red): in pool.ts `readSnapshot` go back to `at: now` -> the first test goes red (the pool claims to be new).
 * The snapshot older than SNAPSHOT_TTL is still ignored (second test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { daysAgo, seedEpisode } from './dv-neutral.ts';
import * as pool from '../src/db/repos/discover/ddb/pool.ts';

const MIN = 60_000;

async function world() {
  pool.resetDiscoverPool();
  const t = await freshDb({ picksRaw: [], today: () => '2026-10-06' });
  await seedEpisode(t, { id: 'e1', feedUrl: 'https://f.example/1.xml', guid: 'g1', title: 'E1', publishedAt: daysAgo(1) });
  const store = t.store as unknown as { clock: { now(): number } };
  const real = store.clock.now.bind(store.clock);
  let skew = 0;
  store.clock = { now: () => real() + skew };
  return { t, advance: (ms: number) => { skew += ms; } };
}

test('a pool read from a 9-minute-old snapshot reports the build time; the memory TTL runs from it', async () => {
  const { t, advance } = await world();
  try {
    assert.equal((await pool.warmDiscoverPool(t.store)).snapshot, 'written');
    const builtAt = (await pool.sharedPool(t.store)).at; // the warm-up's own copy
    pool.resetDiscoverPool(); // another instance: nothing in memory
    advance(9 * MIN);
    const p = await pool.sharedPool(t.store);
    assert.ok(Math.abs(p.at - builtAt) <= 1, `at is the build time ${builtAt}, got ${p.at} (${(p.at - builtAt) / MIN} min later)`);
    advance(2 * MIN); // 11 min since the build: older than the 5-minute memory TTL (it is also past the snapshot's 10 minutes)
    const later = await pool.sharedPool(t.store);
    assert.notEqual(later, p, 'the copy built 11 minutes ago is not served from memory');
    assert.ok(later.at - builtAt >= 11 * MIN - 1, `rebuilt live now, at ${(later.at - builtAt) / MIN} min after the first build`);
  } finally { await t.close(); }
});

test('a snapshot older than SNAPSHOT_TTL is still ignored', async () => {
  const { t, advance } = await world();
  try {
    assert.equal((await pool.warmDiscoverPool(t.store)).snapshot, 'written');
    const builtAt = (await pool.sharedPool(t.store)).at;
    pool.resetDiscoverPool();
    advance(pool.SNAPSHOT_TTL + 1);
    const p = await pool.sharedPool(t.store);
    assert.ok(p.at - builtAt >= pool.SNAPSHOT_TTL, 'built live now, not from the old snapshot');
  } finally { await t.close(); }
});
