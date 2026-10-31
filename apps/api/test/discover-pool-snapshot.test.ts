// Tests M32 lane FA: the hunt pool is built by the hourly job and stored in sm-cache, so a cold API instance does not pay for the build.
/**
 * Guards (break -> red):
 * - "a snapshot answers a cold instance": in pool.ts `build()` stop reading the snapshot -> the first test goes red (a Scan + ~280 Query).
 * - "the sweep step warms the pool": remove the warm-up from the `sweep` step in routes/internal.ts -> the third test goes red.
 * - "too big or too old falls back to the live build": remove the size/age checks -> the second test goes red.
 * Real numbers are printed by the first test and copied by hand into specs/034-m32-code-review/demo/hunt-op-counts.txt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { daysAgo, seedEpisode, seedListen } from './dv-neutral.ts';
import * as pool from '../src/db/repos/discover/ddb/pool.ts';

type Counts = { scan: number; query: number; other: number };
function counting(store: { send: (c: { constructor: { name: string } }) => Promise<unknown> }) {
  const c: Counts = { scan: 0, query: 0, other: 0 };
  const orig = store.send.bind(store);
  store.send = (cmd) => {
    const n = cmd.constructor.name;
    if (n === 'ScanCommand') c.scan++; else if (n === 'QueryCommand') c.query++; else c.other++;
    return orig(cmd);
  };
  return { snap: (): Counts => ({ ...c }), reset: () => { c.scan = 0; c.query = 0; c.other = 0; } };
}

async function world(opts: { jobToken?: string } = {}) {
  pool.resetDiscoverPool();
  const t = await freshDb({ picksRaw: [], today: () => '2026-10-06', ...opts });
  for (let i = 1; i <= 12; i++) {
    await seedEpisode(t, { id: `e${i}`, feedUrl: `https://f.example/${i}.xml`, guid: `g${i}`, title: `Episode ${i}`, showTitle: `Show ${i}`, enclosureUrl: `https://cdn/${i}.mp3`, imageUrl: `https://img/${i}.jpg`, publishedAt: daysAgo(i) });
  }
  await seedListen(t, 'someone', 'e1');
  return t;
}
const hunt = async (t: Awaited<ReturnType<typeof world>>) => {
  const r = await t.app.request('/v1/discover/hunt?shuffle=0');
  assert.equal(r.status, 200);
  return (await r.json()) as { items: { id: string }[] };
};

test('a cold API instance reads the job\'s snapshot: no Scan and no day Queries', async () => {
  const t = await world();
  try {
    assert.equal(typeof (pool as Record<string, unknown>)['warmDiscoverPool'], 'function', 'warmDiscoverPool(store) exists');
    const live = await hunt(t); // the live build, for the reference answer
    pool.resetDiscoverPool();
    const w = await pool.warmDiscoverPool(t.store);
    assert.equal(w.snapshot, 'written');
    pool.resetDiscoverPool(); // another Lambda instance: nothing in memory
    const ops = counting(t.store as never);
    const cold = await hunt(t);
    const n = ops.snap();
    console.log(`SNAPSHOT cold anonymous hunt (12 episodes): ${n.scan} Scan, ${n.query} Query, ${n.other} other`);
    assert.equal(n.scan, 0, 'no Scan');
    assert.ok(n.query <= 3, `at most 3 Query, got ${n.query}`);
    assert.deepEqual(cold.items.map((i) => i.id), live.items.map((i) => i.id), 'same answer as the live build');
  } finally { await t.close(); }
});

test('a snapshot that is too big or too old is not used: the live build runs (and is the same answer)', async () => {
  const t = await world();
  try {
    assert.equal(typeof (pool as Record<string, unknown>)['warmDiscoverPool'], 'function');
    const reference = await hunt(t); // the live build; since M31 it also stores a snapshot, which these steps must not read
    const store = t.store as unknown as { clock: { now(): number } };
    const real = store.clock.now.bind(store.clock);
    let skew = pool.SNAPSHOT_TTL + 1; // the reference build's snapshot is now too old
    store.clock = { now: () => real() + skew };
    // Too big: the job skips writing it.
    pool.resetDiscoverPool();
    const big = await pool.warmDiscoverPool(t.store, { maxSnapshotBytes: 10 });
    assert.equal(big.snapshot, 'too-big');
    pool.resetDiscoverPool();
    const ops = counting(t.store as never);
    // The live build below stores a snapshot again (M31): the checks that follow move the clock past it.
    const a = await hunt(t);
    assert.equal(ops.snap().scan, 1, 'no usable snapshot: the live build Scans once');
    assert.deepEqual(a.items.map((i) => i.id), reference.items.map((i) => i.id));
    // Too old: written, then the clock moves past its 10 minutes.
    pool.resetDiscoverPool();
    assert.equal((await pool.warmDiscoverPool(t.store)).snapshot, 'written');
    pool.resetDiscoverPool();
    skew += pool.SNAPSHOT_TTL + 1;
    ops.reset();
    await hunt(t);
    assert.equal(ops.snap().scan, 1, 'an old snapshot: the live build Scans once');
    store.clock = { now: real };
  } finally { await t.close(); }
});

test('the hourly sweep step warms the pool and stores the snapshot', async () => {
  const t = await world({ jobToken: 'job-token-not-secret' });
  try {
    pool.resetDiscoverPool();
    const res = await t.call('POST', '/v1/internal/rebuild', { step: 'sweep' }, undefined, { authorization: 'Bearer job-token-not-secret' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { counts: { poolWarmed?: number } };
    assert.equal(body.counts.poolWarmed, 1, 'the step reports the warm-up');
    pool.resetDiscoverPool();
    const ops = counting(t.store as never);
    await hunt(t);
    assert.equal(ops.snap().scan, 0, 'the first hunt after the job does no Scan');
  } finally { await t.close(); }
});
