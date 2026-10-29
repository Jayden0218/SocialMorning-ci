// Tests M32 lane FA (review finding on the hunt's cold cost): the nine partitions of one day are read in parallel, in the same merged order.
/**
 * Guard "queryDay is parallel" — the break that turns it red: in src/db/ddb/day-index.ts go back to a `for … await` over
 * `dayPks(day)`; the concurrency assertion goes red (max in flight 1).
 * Guard "listensSince days are bounded-parallel" — in src/db/repos/discover/ddb/listens.ts go back to one `await` per day;
 * the second test goes red. The equality assertions guard that the answer did not change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { seedEpisode, seedListen } from './dv-neutral.ts';
import { queryDay } from '../src/db/ddb/day-index.ts';
import { listensSince } from '../src/db/repos/discover/ddb/listens.ts';
import { queryAll } from '../src/db/ddb/paginate.ts';
import { dayPks, INDEX } from '../src/db/ddb/keys.ts';

type Sendable = { send: (c: { constructor: { name: string } }) => Promise<unknown> };
/** Every Query takes `ms`; records how many were in flight at once. */
function slowQueries(store: Sendable, ms: number) {
  const st = { inFlight: 0, max: 0, queries: 0 };
  const orig = store.send.bind(store);
  store.send = async (cmd) => {
    if (cmd.constructor.name !== 'QueryCommand') return orig(cmd);
    st.queries++; st.inFlight++; st.max = Math.max(st.max, st.inFlight);
    try { await new Promise((r) => setTimeout(r, ms)); return await orig(cmd); } finally { st.inFlight--; }
  };
  return st;
}

const todayUtc = () => new Date().toISOString().slice(0, 10);
const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

async function seedDay(t: Awaited<ReturnType<typeof freshDb>>, days: number[], perDay: number) {
  await seedEpisode(t, { id: 'e1', feedUrl: 'https://f.example/1.xml', guid: 'g1', title: 'E1' });
  for (const d of days) for (let i = 0; i < perDay; i++) await seedListen(t, `actor-${d}-${i}`, 'e1', { day: dayAgo(d) });
}

test('queryDay reads the nine partitions of a day in parallel and merges them in the same E1SK order', async () => {
  const t = await freshDb({ picksRaw: [], today: () => todayUtc() });
  try {
    await seedDay(t, [0], 40);
    const day = todayUtc();
    const sk = { condition: 'E1SK > :from', values: { ':from': 'lsn#' } };
    // The sequential reference: the nine partitions one after another, merged by E1SK.
    const ref: Record<string, unknown>[] = [];
    for (const pk of dayPks(day)) {
      ref.push(...(await queryAll(t.store, 'events', { IndexName: INDEX.E1, KeyConditionExpression: 'E1PK = :d AND E1SK > :from', ExpressionAttributeValues: { ':d': pk, ':from': 'lsn#' } })).items);
    }
    ref.sort((a, b) => (String(a['E1SK']) < String(b['E1SK']) ? -1 : String(a['E1SK']) > String(b['E1SK']) ? 1 : 0));
    assert.ok(ref.length >= 40, `seeded ${ref.length}`);

    const st = slowQueries(t.store as never, 30);
    const got = await queryDay(t.store, day, sk);
    console.log(`queryDay: ${st.queries} Query, max in flight ${st.max}`);
    assert.equal(st.queries, 9);
    assert.ok(st.max > 1, `the nine partitions overlap, max in flight ${st.max}`);
    assert.deepEqual(got.map((i) => [i['PK'], i['SK'], i['E1SK']]), ref.map((i) => [i['PK'], i['SK'], i['E1SK']]), 'same items, same order');
  } finally { await t.close(); }
});

test('listensSince reads its days bounded-parallel and returns the same marks', async () => {
  const t = await freshDb({ picksRaw: [], today: () => todayUtc() });
  try {
    await signUp(t, 'fa@example.com', 'FA');
    await seedDay(t, [0, 1, 2, 3, 5, 8, 13, 21, 29], 3);
    const now = Date.now();
    const since = now - 30 * 86_400_000;
    const before = await listensSince(t.store, since, now);
    assert.equal(before.length, 27);
    const st = slowQueries(t.store as never, 20);
    const t0 = Date.now();
    const got = await listensSince(t.store, since, now);
    const took = Date.now() - t0;
    console.log(`listensSince 30 d: ${st.queries} Query, max in flight ${st.max}, ${took} ms`);
    assert.ok(st.max > 9, `days overlap too (more than one day's nine Queries at once), max in flight ${st.max}`);
    assert.ok(st.max <= 6 * 9, `bounded: at most 6 days x 9 partitions in flight, got ${st.max}`);
    assert.deepEqual(got, before, 'same marks in the same order');
  } finally { await t.close(); }
});
