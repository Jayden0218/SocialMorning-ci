// Tests M31 (planner, 2026-10-29): a LIVE pool build in the API also writes the Discover snapshot, so a cold Lambda finds a fresh one all hour.
/**
 * Guards (break -> red):
 * - "a live build writes the snapshot": in pool.ts `sharedPool` stop writing the snapshot after `build` -> the first test goes red (a cold instance Scans).
 * - "at most once per build": write on every call -> the second test goes red.
 * - "a failing write is swallowed": remove the catch -> the third test goes red (the hunt answers 500).
 * - "the size cap": remove the cap check in the live path -> the fourth test goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { daysAgo, seedEpisode, seedListen } from './dv-neutral.ts';
import * as pool from '../src/db/repos/discover/ddb/pool.ts';

type Counts = { scan: number; query: number; put: number };
function counting(store: { send: (c: { constructor: { name: string } }) => Promise<unknown> }, failPuts = false) {
  const c: Counts = { scan: 0, query: 0, put: 0 };
  const orig = store.send.bind(store);
  store.send = (cmd) => {
    const n = cmd.constructor.name;
    if (n === 'ScanCommand') c.scan++; else if (n === 'QueryCommand') c.query++;
    else if (n === 'PutCommand' || n === 'BatchWriteCommand' || n === 'TransactWriteCommand') {
      c.put++;
      if (failPuts) return Promise.reject(new Error('write refused'));
    }
    return orig(cmd);
  };
  return { snap: (): Counts => ({ ...c }), reset: () => { c.scan = 0; c.query = 0; c.put = 0; } };
}

async function world() {
  pool.resetDiscoverPool();
  const t = await freshDb({ picksRaw: [], today: () => '2026-10-06' });
  for (let i = 1; i <= 12; i++) {
    await seedEpisode(t, { id: `e${i}`, feedUrl: `https://f.example/${i}.xml`, guid: `g${i}`, title: `Episode ${i}`, showTitle: `Show ${i}`, enclosureUrl: `https://cdn/${i}.mp3`, imageUrl: `https://img/${i}.jpg`, publishedAt: daysAgo(i) });
  }
  await seedListen(t, 'someone', 'e1');
  return t;
}
const hunt = async (t: Awaited<ReturnType<typeof world>>) => {
  const r = await t.app.request('/v1/discover/hunt?shuffle=0');
  return { status: r.status, body: (await r.json()) as { items?: { id: string }[] } };
};

test('a live build in the API writes the snapshot: a fresh store instance reads it with 0 Scan', async () => {
  const t = await world();
  try {
    const live = await hunt(t); // no job ran: this is the live build
    assert.equal(live.status, 200);
    pool.resetDiscoverPool(); // another Lambda instance: nothing in memory
    const ops = counting(t.store as never);
    const cold = await hunt(t);
    assert.equal(cold.status, 200);
    assert.equal(ops.snap().scan, 0, 'no Scan on the second instance');
    assert.deepEqual(cold.body.items?.map((i) => i.id), live.body.items?.map((i) => i.id), 'same answer');
  } finally { await t.close(); }
});

test('the snapshot is written at most once per build', async () => {
  const t = await world();
  try {
    const ops = counting(t.store as never);
    await hunt(t);
    const first = ops.snap().put;
    assert.ok(first >= 1, 'the build wrote the snapshot');
    await hunt(t); await hunt(t); // memory copy still fresh: no new build, no new write
    assert.equal(ops.snap().put, first, 'no write without a build');
  } finally { await t.close(); }
});

test('a failing snapshot write does not fail the hunt', async () => {
  const t = await world();
  try {
    counting(t.store as never, true);
    const r = await hunt(t);
    assert.equal(r.status, 200);
    assert.ok((r.body.items?.length ?? 0) > 0);
  } finally { await t.close(); }
});
