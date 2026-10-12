// M26 lane MIG: the cutover copy end to end on DynamoDB Local — seed Postgres, copy, count-check, copy again, diff the API, copy back; and its three guards.
/**
 * tasks.md MIG-01…MIG-05. No AWS, no Neon: PGlite (every migration) is "the old database", DynamoDB Local the new one.
 * 1. Postgres gets the base fixture (test/mig-seed-base.ts), the demo seed (scripts/seed-demo.ts, through the repos)
 *    and each lane's rows (test/mig-seed-<lane>.ts) — every table of the database has rows (asserted).
 * 2. copy-to-ddb into a fresh table set; 3. count-check passes; 4. a second copy leaves the item count unchanged
 *    (idempotent) and count-check still passes; 5. diff-listeners for 5 listeners: the API answers are equal.
 * 6. copy-back: writes made on DynamoDB after the copy reach Postgres, and old and new answer alike again.
 * Guards: G-M26-MIG1 a table's copy left out → count-check fails naming the table; G-M26-MIG2 one counter corrupted →
 * count-check fails naming the counter; G-M26-MIG3 one field changed in the copy → diff-listeners fails.
 * Runs only with DDB_ENDPOINT (ci/workflows/ddb-api.yml); skipped in the Postgres gate.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { TestStore } from './harness.ts';
import type { SeedBase } from './mig-seed-base.ts';
import type { Db } from '../src/db/db.ts';

// Nothing of the DynamoDB path is loaded on Postgres (the PGlite coverage run counts loaded files — .c8rc.json).
const DDB_ON = Boolean(process.env['DDB_ENDPOINT']);
const H = () => import('./harness.ts');

const LONG = { skip: !DDB_ON, timeout: 900_000 };
const LANES = ['ac', 'lb', 'sc', 'sg', 'pd', 'sf', 'st', 'dv'] as const;

let pg: { close(): Promise<unknown> } | undefined;
let db: Db;
let base: SeedBase;
let main: TestStore;
let listeners: string[] = [];
const stores: TestStore[] = [];
const log = (l: string) => { if (/MISMATCH|UNMAPPED|ERROR|DIFF/.test(l)) console.log(l); };

async function totalItems(s: TestStore): Promise<number> {
  const { scanTable, TABLE_ROLES } = await import('../scripts/copy/engine.ts');
  let n = 0;
  for (const t of TABLE_ROLES) n += (await scanTable(s.store, t)).length;
  return n;
}

before(async () => {
  if (!DDB_ON) return;
  const { migratedPg, dbOf } = await H();
  const m = await migratedPg();
  pg = m.pg;
  db = dbOf(m.pg);
  base = await (await import('./mig-seed-base.ts')).seedBase(db);
  const { seedDemo } = await import('../scripts/seed-demo.ts');
  await seedDemo(db, { password: 'demo-password-not-secret', now: base.now });
  for (const lane of LANES) {
    const mod = (await import(`./mig-seed-${lane}.ts`)) as { seed(b: SeedBase): Promise<void> };
    await mod.seed(base);
  }
  // episode_heat is derived: rebuilt from the seeded reactions and comments, as the app keeps it.
  const { rebuildEpisodeHeat } = await import('../src/heat/rebuild.ts');
  for (const e of await db.query<{ id: string }>('SELECT id FROM episodes')) await rebuildEpisodeHeat(db, e.id);
  main = await (await H()).freshStore();
  stores.push(main);
}, { timeout: 600_000 });

after(async () => {
  for (const s of stores) await s.close().catch(() => undefined);
  await pg?.close().catch(() => undefined);
});

test('the fixture covers every table of the database', LONG, async () => {
  const tables = await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  const empty: string[] = [];
  for (const t of tables) {
    const [r] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t.table_name}`);
    if (Number(r!.n) === 0) empty.push(t.table_name);
  }
  // Build buffers and legacy tables migrations emptied are allowed to be empty (their specs say `skip`).
  const { MODULES } = await import('../scripts/copy/registry.ts');
  const skipped = new Set(MODULES.flatMap((m) => m.tables.filter((t) => t.skip).map((t) => t.pgTable)));
  assert.deepEqual(empty.filter((t) => !skipped.has(t)), [], 'every copied table has rows in the fixture');
  assert.ok(tables.length >= 116, `116 tables expected, found ${tables.length}`);
});

test('copy → count-check → copy again (idempotent) → diff-listeners for 5 listeners', LONG, async () => {
  const { copyToDdb } = await import('../scripts/copy/engine.ts');
  const { MODULES } = await import('../scripts/copy/registry.ts');
  const { countCheck } = await import('../scripts/count-check.ts');
  const { diffListeners, pickListeners } = await import('../scripts/diff-listeners.ts');
  const first = await copyToDdb({ pg: db, store: main.store, modules: MODULES, log });
  assert.ok(first.totalItems > 500, `the copy wrote ${first.totalItems} items`);
  const check = await countCheck({ pg: db, store: main.store, log });
  assert.deepEqual(check.failures, [], 'count-check after the copy');
  const n1 = await totalItems(main);
  await copyToDdb({ pg: db, store: main.store, modules: MODULES });
  assert.equal(await totalItems(main), n1, 'a second copy leaves the item count unchanged');
  assert.deepEqual((await countCheck({ pg: db, store: main.store })).failures, [], 'count-check after the second copy');
  listeners = await pickListeners(db, 5, [base.L.bea]);
  assert.equal(listeners.length, 5);
  const d = await diffListeners({ pg: db, store: main.store, listenerIds: listeners, log });
  assert.ok(d.asked >= 5 * 19, `asked ${d.asked}`);
  assert.deepEqual(d.diffs, [], 'the API answers the same on Postgres and on DynamoDB');
  if (d.order.length) console.log(`${d.order.length} answers held the same items in another order (rows tied on their time)`);
});

test('G-M26-MIG1: a table whose copy is left out fails count-check by name', LONG, async () => {
  const { copyToDdb } = await import('../scripts/copy/engine.ts');
  const { MODULES, allTables } = await import('../scripts/copy/registry.ts');
  const { countCheck } = await import('../scripts/count-check.ts');
  const follows = allTables().find((t) => t.spec.pgTable === 'follows')!.spec;
  const s = await (await H()).freshStore();
  stores.push(s);
  await copyToDdb({ pg: db, store: s.store, modules: MODULES, skip: follows.sources.map((x) => x.name) });
  const r = await countCheck({ pg: db, store: s.store });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => f.kind === 'table' && f.table === 'follows'), 'count-check names the table follows');
});

test('G-M26-MIG2: one corrupted counter fails count-check by name', LONG, async () => {
  const { readAll } = await import('../scripts/copy/engine.ts');
  const { countCheck } = await import('../scripts/count-check.ts');
  const { update } = await import('../src/db/ddb/store.ts');
  const ix = await readAll(main.store);
  const liked = ix.ofType('comment').find((c) => Number(c['likeCount'] ?? 0) > 0);
  assert.ok(liked, 'the fixture has a liked comment');
  const key = { PK: String(liked['PK']), SK: String(liked['SK']) };
  const was = Number(liked['likeCount']);
  await update(main.store, 'main', key, { update: 'SET #c = :n', names: { '#c': 'likeCount' }, values: { ':n': was + 1 } });
  try {
    const r = await countCheck({ pg: db, store: main.store });
    const bad = r.failures.filter((f) => f.kind === 'counter' && f.key === `${key.PK}|${key.SK}`);
    assert.ok(bad.length > 0, 'count-check names the corrupted comment');
    assert.ok(bad.some((f) => f.kind === 'counter' && /like/i.test(f.counter)), `the counter is named: ${JSON.stringify(bad)}`);
  } finally {
    await update(main.store, 'main', key, { update: 'SET #c = :n', names: { '#c': 'likeCount' }, values: { ':n': was } });
  }
});

test('G-M26-MIG3: one field changed in the copy fails diff-listeners', LONG, async () => {
  const { readAll } = await import('../scripts/copy/engine.ts');
  const { diffListeners } = await import('../scripts/diff-listeners.ts');
  const { update } = await import('../src/db/ddb/store.ts');
  const who = listeners[0] ?? base.L.bea;
  const ix = await readAll(main.store);
  const sub = ix.ofType('subscription').find((s) => s['listenerId'] === who && !s['deletedAt']);
  assert.ok(sub, 'the listener has a live subscription');
  const key = { PK: String(sub['PK']), SK: String(sub['SK']) };
  const was = sub['starred'] === true;
  await update(main.store, 'main', key, { update: 'SET #s = :s', names: { '#s': 'starred' }, values: { ':s': !was } });
  try {
    const d = await diffListeners({ pg: db, store: main.store, listenerIds: [who], routes: ['/v1/me/subscriptions'] });
    assert.equal(d.ok, false, 'diff-listeners sees the changed field');
  } finally {
    await update(main.store, 'main', key, { update: 'SET #s = :s', names: { '#s': 'starred' }, values: { ':s': was } });
  }
});

test('copy-back: writes made on DynamoDB after the copy reach Postgres', LONG, async () => {
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { follow, unfollow } = await import('../src/db/repos/social/follows.ts');
  const { getEpisode } = await import('../src/db/repos/library/episodes.ts');
  const { postCommentInTx } = await import('../src/db/repos/social/comment-writes.ts');
  const { copyBack } = await import('../scripts/copy-back.ts');
  const { countCheck } = await import('../scripts/count-check.ts');
  const { diffListeners } = await import('../scripts/diff-listeners.ts');
  const newDb = withStore(db, main.store, { bridge: false });
  const [a, b] = [base.L.cy, base.L.eli];
  const followedBefore = await db.query('SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2', [a, b]);
  if (followedBefore.length) await unfollow(newDb, a, b); else await follow(newDb, a, b);
  const e = base.ep('rocky');
  const row = await getEpisode(newDb, e.id);
  const c = await postCommentInTx(newDb, row!, e.id, a, { body: 'Written after the copy.', offsetMs: 60_000 }, undefined);
  await main.drain(); // the outbox (feed fan-out, Studio facts) runs after a write, as in production
  assert.equal((await db.query('SELECT 1 FROM comments WHERE id = $1', [c.id])).length, 0, 'the bridge is off: Postgres has not seen it');
  const r = await copyBack({ pg: db, store: main.store, log });
  assert.ok((r.upserted['comments'] ?? 0) >= 1, 'the new comment went back');
  assert.equal((await db.query('SELECT 1 FROM comments WHERE id = $1', [c.id])).length, 1);
  const followedAfter = await db.query('SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2', [a, b]);
  assert.equal(followedAfter.length, followedBefore.length ? 0 : 1, 'the follow change went back');
  assert.deepEqual((await countCheck({ pg: db, store: main.store, log })).failures, [], 'counts agree again after copy-back');
  const d = await diffListeners({ pg: db, store: main.store, listenerIds: [a, b], log });
  assert.deepEqual(d.diffs, [], 'old and new answer alike after copy-back');
});
