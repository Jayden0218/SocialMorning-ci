// Tests M32 lane GA (verification finding 1): the E1 day Queries survive a throttled index and stay gentle on a low-throughput one.
/**
 * Spec 032 gives the dev/qa indexes 1 RCU. Up to 54 day Queries in flight can be throttled; the SDK retries only 3 times and
 * `queryAll` not at all, so a cold pool build could throw ProvisionedThroughputExceededException.
 * Guards (break -> red):
 * - "day Queries retry throttling": in src/db/ddb/day-index.ts drop the withRetry around queryAll -> tests 1-3 go red.
 * - "bounded, and only throttling": make the retry unbounded / retry every error -> tests 4 and 5 go red.
 * - "low throughput reads one day at a time": drop the ddbLowThroughput() branch in listens.ts -> test 6 goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';
import { seedEpisode, seedListen } from './dv-neutral.ts';
import { queryDay } from '../src/db/ddb/day-index.ts';
import { listensSince } from '../src/db/repos/discover/ddb/listens.ts';
import { INDEX } from '../src/db/ddb/keys.ts';
import * as pool from '../src/db/repos/discover/ddb/pool.ts';
import { wrapStore, type Store } from '../src/db/ddb/store.ts';
import type { QueryAllOptions } from '../src/db/ddb/paginate.ts';

const todayUtc = () => new Date().toISOString().slice(0, 10);
const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const noSleep = async () => {};

const isDayQuery = (cmd: { constructor: { name: string }; input?: unknown }) =>
  cmd.constructor.name === 'QueryCommand' && (cmd.input as { IndexName?: string } | undefined)?.IndexName === INDEX.E1;

/** Throws `name` for the first `n` E1 Query sends (all of them when n is Infinity); counts the Query sends. */
function throttled(store: Store, n: number, name = 'ProvisionedThroughputExceededException') {
  const st = { queries: 0, thrown: 0, inFlight: 0, max: 0 };
  const wrapped = wrapStore(store, async (cmd, next) => {
    if (!isDayQuery(cmd as never)) return next(cmd);
    st.queries++;
    if (st.thrown < n) { st.thrown++; throw Object.assign(new Error('The level of configured provisioned throughput for the table was exceeded.'), { name }); }
    st.inFlight++; st.max = Math.max(st.max, st.inFlight);
    try { await new Promise((r) => setTimeout(r, 15)); return await next(cmd); } finally { st.inFlight--; }
  });
  return Object.assign(wrapped, { st });
}

async function world() {
  pool.resetDiscoverPool();
  const t = await freshDb({ picksRaw: [], today: () => todayUtc() });
  await seedEpisode(t, { id: 'e1', feedUrl: 'https://f.example/1.xml', guid: 'g1', title: 'E1', publishedAt: dayAgo(3) });
  for (const d of [0, 1, 2, 5, 9, 14]) for (let i = 0; i < 3; i++) await seedListen(t, `actor-${d}-${i}`, 'e1', { day: dayAgo(d) });
  return t;
}
const sk = { condition: 'E1SK > :from', values: { ':from': 'lsn#' } };
const keys = (xs: Record<string, unknown>[]) => xs.map((i) => [i['PK'], i['SK'], i['E1SK']]);

test('queryDay retries a throttled Query and returns what an unthrottled run returns', async () => {
  const t = await world();
  try {
    const ref = await queryDay(t.store, todayUtc(), sk);
    assert.ok(ref.length >= 3);
    const s = throttled(t.store, 4);
    const got = await queryDay(s, todayUtc(), sk, { retry: { sleep: noSleep } } as QueryAllOptions);
    assert.ok(s.st.thrown === 4, `throttled ${s.st.thrown}`);
    assert.deepEqual(keys(got), keys(ref));
  } finally { await t.close(); }
});

test('listensSince survives a throttled burst and returns the same marks', async () => {
  const t = await world();
  try {
    const now = Date.now();
    const ref = await listensSince(t.store, now - 30 * 86_400_000, now);
    assert.equal(ref.length, 18);
    const s = throttled(t.store, 5, 'ThrottlingException');
    const got = await listensSince(s, now - 30 * 86_400_000, now);
    assert.equal(s.st.thrown, 5);
    assert.deepEqual(got, ref);
  } finally { await t.close(); }
});

test('the cold sharedPool build survives a throttled index', async () => {
  const t = await world();
  try {
    const ref = await pool.sharedPool(t.store);
    pool.resetDiscoverPool();
    const s = throttled(t.store, 6, 'RequestLimitExceeded');
    const got = await pool.sharedPool(s);
    assert.equal(s.st.thrown, 6);
    assert.deepEqual([...got.plays], [...ref.plays]);
    assert.deepEqual(got.rows.map((r) => r.id), ref.rows.map((r) => r.id));
  } finally { await t.close(); }
});

test('a throttle that never stops still rejects after a bounded number of attempts', async () => {
  const t = await world();
  try {
    const s = throttled(t.store, Number.POSITIVE_INFINITY);
    await assert.rejects(queryDay(s, todayUtc(), sk, { retry: { tries: 3, sleep: noSleep } } as QueryAllOptions), (e: Error) => e.name === 'ProvisionedThroughputExceededException');
    assert.ok(s.st.queries >= 9 && s.st.queries <= 9 * 3, `bounded: ${s.st.queries} Query sends`);
  } finally { await t.close(); }
});

test('an error that is not a throttle is not retried', async () => {
  const t = await world();
  try {
    const s = throttled(t.store, Number.POSITIVE_INFINITY, 'ValidationException');
    await assert.rejects(queryDay(s, todayUtc(), sk, { retry: { sleep: noSleep } } as QueryAllOptions), (e: Error) => e.name === 'ValidationException');
    assert.ok(s.st.queries <= 9, `each partition sent once, got ${s.st.queries}`);
  } finally { await t.close(); }
});

test('DDB_LOW_THROUGHPUT=1 reads one day (nine Queries) at a time and still answers the same', async () => {
  const t = await world();
  const old = process.env['DDB_LOW_THROUGHPUT'];
  try {
    const now = Date.now();
    const ref = await listensSince(t.store, now - 30 * 86_400_000, now);
    process.env['DDB_LOW_THROUGHPUT'] = '1';
    const s = throttled(t.store, 0);
    const got = await listensSince(s, now - 30 * 86_400_000, now);
    assert.ok(s.st.max <= 9, `at most one day's nine Queries in flight, got ${s.st.max}`);
    assert.deepEqual(got, ref);
  } finally {
    if (old === undefined) delete process.env['DDB_LOW_THROUGHPUT']; else process.env['DDB_LOW_THROUGHPUT'] = old;
    await t.close();
  }
});
