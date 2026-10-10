// Guard G-M26-SF4 on DynamoDB Local: the dashboard's hourly safety counters equal a recount of the items, and the nightly check repairs one that drifted.
/**
 * M26 lane SF. Reports, moderation actions and blocks (and one unblock) are made through the app's own functions
 * at different hours of one UTC+8 day (a test clock on the Store), plus one report the next day. Then:
 * - every hour's counter `R#dash#<metric>` equals `recountDay` (the recount from the report/action/block items);
 * - the dashboard's safety numbers equal the recount's sums (and open reports = the open queue);
 * - a counter corrupted on purpose (and one that should not exist) is set back to the recount by `checkDashboard`,
 *   once a night for the automatic run.
 *
 * Break that turns it red: drop the `dashAdd` call in the DynamoDB `block()` (src/db/repos/safety/ddb/blocks.ts) —
 * the blocks counters stay 0 while the recount sees the block items.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** As test/fixtures.ts DDB_ON (read here so the Postgres run never loads the DynamoDB modules). */
const ON = Boolean(process.env['DDB_ENDPOINT']);

test('G-M26-SF4: the hourly safety counters equal a recount of the items; the nightly check repairs a drifted one', { skip: !ON }, async () => {
  const { migratedPg, dbOf, freshStore, signUp } = await import('./harness.ts');
  const { testClock } = await import('./fixtures.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { get, update } = await import('../src/db/ddb/store.ts');
  const { computeMetrics, checkDashboard } = await import('../src/db/repos/admin/metrics.ts');
  const { recountDay } = await import('../src/db/repos/safety/ddb/metrics.ts');
  const { DASH_METRICS, dashKey } = await import('../src/db/repos/safety/ddb/dash.ts');
  const { createReport, closeReportsFor } = await import('../src/db/repos/safety/reports.ts');
  const { act } = await import('../src/db/repos/safety/moderation.ts');
  const { block, unblock } = await import('../src/db/repos/safety/blocks.ts');

  // UTC+8 day 2026-10-10 runs from 2026-10-09T16:00Z to 2026-10-10T16:00Z.
  const DAY = '2026-10-10';
  const NEXT = '2026-10-11';
  const clock = testClock('2026-10-09T17:05:00.000Z');
  const { pg } = await migratedPg();
  const s = await freshStore({ clock });
  await (await import('../src/db/repos/safety/ddb/content-seed.ts')).copyContentSeed(s.store, dbOf(pg)); // as hybridDb does
  const db = withStore(dbOf(pg), s.store);
  try {
    const a = (await signUp({ db }, 'a@example.com', 'Ana')).id;
    const b = (await signUp({ db }, 'b@example.com', 'Ben')).id;
    const c = (await signUp({ db }, 'c@example.com', 'Cai')).id;

    // 17h UTC: a reports b; a blocks b.
    await createReport(db, { kind: 'profile', targetId: b, reporterId: a, reason: 'spam' });
    assert.equal(await block(db, a, b), 'blocked');
    // 19h: b reports a, and that report is closed (it still counts, by when it was made); an action.
    clock.set('2026-10-09T19:10:00.000Z');
    await createReport(db, { kind: 'profile', targetId: a, reporterId: b, reason: 'other' });
    clock.set('2026-10-09T19:20:00.000Z');
    await closeReportsFor(db, 'profile', a, null, 'dismiss');
    await act(db, a, { kind: 'clip', id: randomUUID() }, 'dismiss');
    // 22h: c reports b; another action; b blocks c; c blocks a and takes it back (an unblock takes its hour off).
    clock.set('2026-10-09T22:30:00.000Z');
    await createReport(db, { kind: 'profile', targetId: b, reporterId: c, reason: 'spam' });
    await act(db, a, { kind: 'clip', id: randomUUID() }, 'dismiss');
    assert.equal(await block(db, b, c), 'blocked');
    assert.equal(await block(db, c, a), 'blocked');
    clock.set('2026-10-10T03:00:00.000Z');
    await unblock(db, c, a);
    // The next UTC+8 day (00:30 there): c reports a.
    clock.set('2026-10-10T16:30:00.000Z');
    await createReport(db, { kind: 'profile', targetId: a, reporterId: c, reason: 'spam' });

    const recount = await recountDay(s.store, DAY);
    assert.deepEqual(recount, {
      reports: { '2026-10-09T17': 1, '2026-10-09T19': 1, '2026-10-09T22': 1 },
      actions: { '2026-10-09T19': 1, '2026-10-09T22': 1 },
      blocks: { '2026-10-09T17': 1, '2026-10-09T22': 1 },
    });
    const next = await recountDay(s.store, NEXT);
    assert.deepEqual(next, { reports: { '2026-10-10T16': 1 }, actions: {}, blocks: {} });

    /** Every hour's counter of a UTC+8 day, as the recount's shape. */
    const counters = async (day: string) => {
      const start = Date.parse(`${day}T00:00:00+08:00`);
      const out: Record<string, Record<string, number>> = {};
      for (const m of DASH_METRICS) {
        out[m] = {};
        for (let h = 0; h < 24; h++) {
          const key = dashKey(m, new Date(start + h * 3_600_000).toISOString());
          const n = Number((await get(s.store, 'events', key))?.['n'] ?? 0);
          if (n !== 0) out[m]![key.SK] = n;
        }
      }
      return out;
    };
    assert.deepEqual(await counters(DAY), recount, 'every hour of the day: the rollup equals the recount');
    assert.deepEqual(await counters(NEXT), next, 'and of the next day');

    // The dashboard's safety numbers are the recount's sums; open reports = those not closed.
    const sum = (r: Record<string, number>) => Object.values(r).reduce((x, y) => x + y, 0);
    const m = await computeMetrics(db, 7, clock.now());
    assert.ok(m.sections.safety.ok, 'the safety section answered');
    assert.deepEqual({ ...m.sections.safety, ok: undefined }, {
      ok: undefined,
      reports: sum(recount.reports) + sum(next.reports),
      actions: sum(recount.actions) + sum(next.actions),
      blocks: sum(recount.blocks) + sum(next.blocks),
      openReports: 3,
    });

    // Corrupt one counter and invent another; the nightly check (yesterday by the Store clock = DAY) puts them back.
    const corrupt = async (metric: 'reports' | 'actions', hourIso: string, n: number) => update(s.store, 'events', dashKey(metric, hourIso), {
      update: 'SET #t = :t, #m = :m, #n = :n', names: { '#t': 't', '#m': 'metric', '#n': 'n' }, values: { ':t': 'rollup', ':m': metric, ':n': n },
    });
    await corrupt('reports', '2026-10-09T19:00:00.000Z', 99);
    await corrupt('actions', '2026-10-10T03:00:00.000Z', 5);
    assert.notDeepEqual(await counters(DAY), recount, 'the corruption is visible');
    assert.equal(await checkDashboard(db), 2, 'two counters repaired');
    assert.deepEqual(await counters(DAY), recount, 'after the check the rollup equals the recount again');
    assert.equal(await checkDashboard(db), 0, 'the automatic check runs once a night');
    await corrupt('reports', '2026-10-09T22:00:00.000Z', 7);
    assert.equal(await checkDashboard(db, DAY), 1, 'a named day is always checked');
    assert.equal(await checkDashboard(db, DAY), 0, 'nothing left to repair');
    assert.deepEqual(await counters(DAY), recount);
  } finally {
    await s.close();
    await pg.close();
  }
});
