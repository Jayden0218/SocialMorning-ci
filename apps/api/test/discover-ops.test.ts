// Tests M32 T016 (review finding C1): the treasure hunt reads the catalogue and the 30-day plays once per 5 minutes, not on every request.
/**
 * Guard "the hunt's pool is shared" — the break that turns it red: in src/db/repos/discover/ddb/explore.ts `huntRows()`
 * call `listensSince` and `catalogueItems` directly again instead of `sharedPool()`; the warm-call test goes red
 * (a Scan and ~31 day Queries on every request).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { daysAgo, seedEpisode, seedListen } from './dv-neutral.ts';
import { resetDiscoverPool } from '../src/db/repos/discover/ddb/pool.ts';

type Counts = { scan: number; query: number; other: number };
function counting(store: { send: (c: { input: object; constructor: { name: string } }) => Promise<unknown> }) {
  const c: Counts = { scan: 0, query: 0, other: 0 };
  const orig = store.send.bind(store);
  (store as { send: unknown }).send = (cmd: { input: object; constructor: { name: string } }) => {
    const n = cmd.constructor.name;
    if (process.env['OPS_TRACE']) console.log('OP', n, JSON.stringify((cmd.input as Record<string, unknown>)['KeyConditionExpression'] ?? ''), JSON.stringify((cmd.input as Record<string, unknown>)['ExpressionAttributeValues'] ?? '').slice(0, 100));
    if (n === 'ScanCommand') c.scan++; else if (n === 'QueryCommand') c.query++; else c.other++;
    return orig(cmd);
  };
  return { c, reset: () => { c.scan = 0; c.query = 0; c.other = 0; }, snap: (): Counts => ({ ...c }) };
}

test('hunt: the warm call does no Scan and at most 4 Query (C1)', async () => {
  resetDiscoverPool();
  const t = await freshDb({ picksRaw: [], today: () => '2026-10-06' });
  try {
    for (let i = 1; i <= 12; i++) {
      await seedEpisode(t, { id: `e${i}`, feedUrl: `https://f.example/${i}.xml`, guid: `g${i}`, title: `Episode ${i}`, showTitle: `Show ${i}`, enclosureUrl: `https://cdn/${i}.mp3`, imageUrl: `https://img/${i}.jpg`, publishedAt: daysAgo(i) });
    }
    const a = await signUp(t, 'ops@example.com', 'Ops');
    await seedListen(t, a.id, 'e1');
    const ops = counting(t.store as never);
    // t.app.request, not t.call: t.call also drains the outbox (4 Queries of its own), which is not the request's cost.
    const call = async (token?: string) => {
      const r = await t.app.request('/v1/discover/hunt?shuffle=0', { headers: token ? { authorization: `Bearer ${token}` } : {} });
      assert.equal(r.status, 200);
      return (await r.json()) as { items: { id: string }[] };
    };
    const cold = await call(a.token); const coldN = ops.snap(); ops.reset();
    const warm = await call(a.token); const warmN = ops.snap(); ops.reset();
    await call(); const anonN = ops.snap();
    const line = `GET /v1/discover/hunt (signed-in viewer, 12 episodes): cold call = ${coldN.scan} Scan, ${coldN.query} Query, ${coldN.other} other; warm call = ${warmN.scan} Scan, ${warmN.query} Query, ${warmN.other} other; warm anonymous call = ${anonN.scan} Scan, ${anonN.query} Query, ${anonN.other} other`;
    console.log(line);
    assert.deepEqual(warm.items.map((i) => i.id), cold.items.map((i) => i.id), 'same answer warm and cold');
    assert.equal(warmN.scan, 0, 'no Scan on a warm call');
    // The 4 left are per-viewer and live on purpose: hidden shows, hidden episodes (moderation takes effect at once), the viewer's subscriptions and turned-down items.
    assert.ok(warmN.query <= 4, `at most 4 Query on a warm signed-in call, got ${warmN.query}`);
    assert.equal(anonN.scan, 0);
    assert.ok(anonN.query <= 3, `at most 4 Query on a warm anonymous call, got ${anonN.query}`);
  } finally { await t.close(); }
});

test('plaza: the warm call does no Scan; and a failed rebuild keeps serving the old pool (stale-while-error)', async () => {
  resetDiscoverPool();
  const t = await freshDb({ picksRaw: [], today: () => '2026-10-06' });
  try {
    for (let i = 1; i <= 5; i++) await seedEpisode(t, { id: `p${i}`, feedUrl: `https://f.example/p${i}.xml`, guid: `g${i}`, title: `E${i}`, showTitle: `S${i}`, publishedAt: daysAgo(i) });
    const ops = counting(t.store as never);
    const plaza = async () => { const r = await t.app.request('/v1/discover/plaza'); assert.equal(r.status, 200); return (await r.json()) as { items: unknown[] }; };
    const first = await plaza(); ops.reset();
    await plaza();
    assert.equal(ops.snap().scan, 0, 'no Scan on a warm plaza');
    assert.equal(first.items.length, 5);

    const { sharedPool, POOL_TTL } = await import('../src/db/repos/discover/ddb/pool.ts');
    const store = t.store as unknown as { clock: { now(): number }; send: (c: unknown) => Promise<unknown> };
    const realNow = store.clock.now.bind(store.clock);
    const warm = await sharedPool(t.store);
    store.clock = { now: () => realNow() + POOL_TTL + 1 }; // the pool is now stale
    const realSend = store.send; store.send = async () => { throw new Error('dynamodb down'); };
    assert.equal((await sharedPool(t.store)).rows.length, warm.rows.length, 'the old pool is served when the rebuild throws');
    store.send = realSend;
  } finally { await t.close(); }
});
