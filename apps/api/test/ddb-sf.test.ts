// Guards of the safety lane on DynamoDB: one report per reporter under a race, act() all-or-nothing, the admin record append-only, the last admin kept.
/**
 * M26 lane SF (tasks.md SF-T09). Each guard was broken on mirror branch `lane-sf-red`, seen red, restored:
 * - G-M26-SF1 — ten reports of one target by one reporter, racing, make ONE report (the `RPT#<kind>#<id>/BY#<reporter>`
 *   key put with attribute_not_exists), one reporter copy and one count on the dashboard; the other nine read `duplicate`.
 *   Break: in src/db/repos/safety/ddb/reports.ts createReport, drop the `condition: 'attribute_not_exists(PK)'` of the report put.
 * - G-M26-SF2 — act() applies the action, its effect and the author's notice together or not at all: with the DynamoDB
 *   transaction failing, no action item, no Postgres bridge row, the comment not removed, no notice, the report open.
 *   Break: in src/db/repos/safety/ddb/moderation.ts act(), move `await t.commit()` out of the `db.transaction(…)` callback (after it).
 * - G-M26-SF3 — no request through the app's Store can update, delete or overwrite an audit record (UpdateItem, DeleteItem,
 *   an unconditional PutItem, a TransactWriteItems Update/Delete, a BatchWriteItem), and the record reads back unchanged.
 *   Break: in src/db/ddb/store.ts createStore, drop the `assertAppendOnly(command)` call.
 * - G-M26-SF5 — the last admin cannot be removed; one of two can.
 *   Break: in src/db/repos/safety/ddb/admin-access.ts removeAdmin, drop `AND size(#a) > :one`.
 * (G-M26-SF4, the dashboard counters against a recount, is in test/ddb-sf-dash.test.ts.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb safety guards (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, signUp, dbOf } = await import('./harness.ts');
  const { putEpisode } = await import('./put-episode.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { withFaults } = await import('../src/db/ddb/test-wrappers.ts');
  const { del, get, put, update, wrapStore } = await import('../src/db/ddb/store.ts');
  const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
  const { tx } = await import('../src/db/ddb/tx.ts');
  const { batchWriteAll } = await import('../src/db/ddb/batch.ts');
  const { encode } = await import('../src/db/ddb/codec.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { acScan } = await import('./fixtures.ts');
  const { createReport } = await import('../src/db/repos/safety/reports.ts');
  const { act } = await import('../src/db/repos/safety/moderation.ts');
  const { insertAudit, removeAdmin } = await import('../src/db/repos/admin/admin-access.ts');
  const { dashKey } = await import('../src/db/repos/safety/ddb/dash.ts');
  const { reportRows } = await import('./sf-neutral.ts');
  const { noticesFor } = await import('../src/db/repos/social/system-notices.ts');

  test('G-M26-SF1: ten racing reports of one target by one reporter make one report, one copy, one count', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'a@example.com', 'Al');
    const r = await signUp(t, 'r@example.com', 'Rae');
    const results = await Promise.all(Array.from({ length: 10 }, () => createReport(t.db, { kind: 'profile', targetId: a.id, reporterId: r.id, reason: 'spam' })));
    assert.equal(results.filter((x) => !x.duplicate).length, 1, `${results.filter((x) => !x.duplicate).length} reports were made`);
    assert.equal(new Set(results.map((x) => x.id)).size, 1, 'every answer names the one report');
    assert.equal((await acScan(t.store!, 'main', 'report')).length, 1);
    assert.equal((await acScan(t.store!, 'main', 'reporterMark')).length, 1, 'one reporter copy');
    const counter = await get(t.store!, 'events', dashKey('reports', new Date().toISOString()));
    assert.equal(Number(counter?.['n'] ?? 0), 1, 'the dashboard counted it once');

    // Deterministic too: a reader that does not see the first report yet (a stale read) still cannot make a second one —
    // the key's attribute_not_exists condition refuses it.
    const stale = withStore(dbOf(t.pg), wrapStore(t.store!, async (cmd, next) => {
      if (cmd instanceof GetCommand && String((cmd.input as { Key?: { PK?: string } }).Key?.PK ?? '').startsWith('RPT#')) return {};
      return next(cmd);
    }));
    const r1 = await createReport(stale, { kind: 'profile', targetId: r.id, reporterId: a.id, reason: 'spam' });
    const r2 = await createReport(stale, { kind: 'profile', targetId: r.id, reporterId: a.id, reason: 'hate' });
    assert.deepEqual([r1.duplicate, r2.duplicate], [false, true], 'the second report by the same reporter is a duplicate');
    assert.equal((await acScan(t.store!, 'main', 'report')).filter((x) => x['targetId'] === r.id).length, 1);
    assert.equal((await acScan(t.store!, 'main', 'report')).find((x) => x['targetId'] === r.id)?.['reason'], 'spam', 'the first reason stands');
    await t.close();
  });

  test('G-M26-SF2: act() with its DynamoDB transaction failing leaves no action, no effect, no notice; then it all happens together', async () => {
    const t = await freshDb();
    const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep', enclosureUrl: 'https://cdn/1.mp3' };
    await putEpisode(t, 'e-sf2', { ...ep, durationMs: 600_000 });
    const a = await signUp(t, 'a@example.com', 'Author');
    const r = await signUp(t, 'r@example.com', 'Reporter');
    const o = await signUp(t, 'o@example.com', 'Owner');
    const res = await t.call('POST', '/v1/episodes/e-sf2/comments', { body: 'rude', offsetMs: 1 }, a.token);
    assert.equal(res.status, 200, await res.clone().text());
    const commentId = ((await res.json()) as { comment: { id: string } }).comment.id;
    assert.equal((await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: commentId, reason: 'spam' }, r.token)).status, 201);

    const state = async () => ({
      actions: (await acScan(t.store!, 'main', 'moderationAction')).length,
      bridge: (await t.q('SELECT 1 FROM moderation_actions')).length,
      removed: (await t.q('SELECT 1 FROM comments WHERE id = $1 AND removed_at IS NOT NULL', [commentId])).length,
      notices: (await noticesFor(t.db, a.id)).length, // lane SG's notice items
      open: (await reportRows(t)).filter((x) => x['closed_at'] === null || x['closed_at'] === undefined).length,
    });
    const faulty = withStore(dbOf(t.pg), withFaults(t.store!, [{ command: 'TransactWriteCommand', prefix: 'MA#' }]));
    await assert.rejects(act(faulty, o.id, { kind: 'comment', id: commentId }, 'remove'), /injected fault/);
    assert.deepEqual(await state(), { actions: 0, bridge: 0, removed: 0, notices: 0, open: 1 }, 'nothing happened');

    await act(t.db, o.id, { kind: 'comment', id: commentId }, 'remove');
    assert.deepEqual(await state(), { actions: 1, bridge: 1, removed: 1, notices: 1, open: 0 }, 'everything happened');
    await t.close();
  });

  test('G-M26-SF3: no request through the Store can change or remove an audit record', async () => {
    const t = await freshDb();
    const o = await signUp(t, 'o@example.com', 'Owner');
    await insertAudit(t.db, { adminId: o.id }, { area: 'users', action: 'rename', target: o.id }, { displayName: 'A' }, { displayName: 'B' });
    const [rec] = (await acScan(t.store!, 'main', 'audit')).filter((i) => !String(i['SK']).includes('#'));
    assert.ok(rec, 'the record exists');
    const key = { PK: String(rec['PK']), SK: String(rec['SK']) };
    const store = t.store!;
    const attempts: [string, () => Promise<unknown>][] = [
      ['UpdateItem', () => update(store, 'main', key, { update: 'SET #a = :a', names: { '#a': 'action' }, values: { ':a': 'nothing happened' } })],
      ['DeleteItem', () => del(store, 'main', key)],
      ['PutItem over it', () => put(store, 'main', { ...rec, action: 'nothing happened' })],
      ['TransactWriteItems Update', () => tx(store).update('main', key, { update: 'SET #a = :a', names: { '#a': 'action' }, values: { ':a': 'x' } }).commit()],
      ['TransactWriteItems Delete', () => tx(store).delete('main', key).commit()],
      ['BatchWriteItem delete', () => batchWriteAll(store, 'main', [{ delete: key }])],
      ['BatchWriteItem put', () => batchWriteAll(store, 'main', [{ put: encode('audit', K.audit(String(rec['createdAt']), 999), { id: 999 }) }])],
    ];
    for (const [what, fn] of attempts) await assert.rejects(fn(), /append-only/, `${what} must be refused`);
    const after = await get(store, 'main', key);
    assert.equal(after?.['action'], 'rename', 'the record is unchanged');
    assert.deepEqual(after?.['before'], { displayName: 'A' });
    await t.close();
  });

  test('G-AD4 on DynamoDB (was DROP TABLE): a fault on one section\'s items fails that section only', async () => {
    const t = await freshDb();
    await signUp(t, 'a@example.com', 'Ada');
    const { computeMetrics } = await import('../src/db/repos/admin/metrics.ts');
    const faulty = withStore(dbOf(t.pg), withFaults(t.store!, [{ command: 'QueryCommand', prefix: 'R#dash#' }]));
    const orig = console.warn; console.warn = () => {};
    const m = await computeMetrics(faulty, 7).finally(() => { console.warn = orig; });
    assert.equal(m.partial, true);
    assert.equal(m.sections.safety.ok, false);
    for (const k of ['users', 'listening', 'library', 'social', 'recs', 'money', 'creators'] as const) assert.equal(m.sections[k].ok, true, k);
    await t.close();
  });

  test('G-M26-SF5: the last admin cannot be removed; one of two can', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'a@example.com', 'Ada');
    const b = await signUp(t, 'b@example.com', 'Bo');
    const at = new Date().toISOString();
    await put(t.store!, 'main', encode('adminSet', K.adminSet(), { admins: { [a.id]: { grantedAt: at, grantedBy: null }, [b.id]: { grantedAt: at, grantedBy: a.id } } }));
    await removeAdmin(t.db, b.id);
    await assert.rejects(removeAdmin(t.db, a.id), /at least one admin/);
    const left = (await get(t.store!, 'main', K.adminSet()))?.['admins'] as Record<string, unknown>;
    assert.deepEqual(Object.keys(left), [a.id]);
    await t.close();
  });
}
