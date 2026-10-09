// Tests the outbox and jobs on DynamoDB Local: work exists only if the change committed, failures are kept, a half-done job resumes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb outbox (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore, TEST_BACKEND, freshDb } = await import('./harness.ts');
  const { encode } = await import('../src/db/ddb/codec.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { get, update } = await import('../src/db/ddb/store.ts');
  const { tx, TxCancelled } = await import('../src/db/ddb/tx.ts');
  const { enqueue, drainOutbox, pendingOutbox, startJob, runJob, resumeJobs } = await import('../src/jobs/outbox.ts');
  const { testClock, backdate, listenerItem, episodeItem, commentItem, proveClaimItem, auditItems, itemAt } = await import('./fixtures.ts');

  test('an entry is written only with its transaction; drain runs the handler once and deletes it', async () => {
    const s = await freshStore();
    const t = tx(s.store).put('main', encode('config', K.config('a'), { v: 1 }));
    enqueue(t, s.store, { kind: 'count', payload: { by: 2 } });
    await t.commit();

    const failing = tx(s.store).put('main', encode('config', K.config('a'), { v: 2 }), { condition: 'attribute_not_exists(PK)' });
    enqueue(failing, s.store, { kind: 'count', payload: { by: 100 } });
    await assert.rejects(failing.commit(), TxCancelled);
    assert.equal((await pendingOutbox(s.store)).length, 1, 'the cancelled transaction left no work');

    let total = 0;
    const handlers = { count: async (_s: unknown, e: { payload: Record<string, unknown> }) => { total += Number(e.payload['by']); } };
    assert.deepEqual(await drainOutbox(s.store, handlers), { done: 1, failed: 0, kept: [] });
    assert.equal(total, 2);
    assert.deepEqual(await drainOutbox(s.store, handlers), { done: 0, failed: 0, kept: [] });
    await s.close();
  });

  test('a failing handler and an unknown kind are kept with attempts and the error — never dropped', async () => {
    const s = await freshStore();
    const t = tx(s.store);
    const bad = enqueue(t, s.store, { kind: 'boom' });
    const unknown = enqueue(t, s.store, { kind: 'nobody-handles-this' });
    await t.commit();
    const handlers = { boom: async () => { throw new Error('push service down'); } };
    const r1 = await drainOutbox(s.store, handlers);
    assert.equal(r1.failed, 2);
    assert.deepEqual([...r1.kept].sort(), [bad, unknown].sort());
    await drainOutbox(s.store, handlers);
    const left = await pendingOutbox(s.store);
    assert.equal(left.length, 2);
    const boom = left.find((i) => i['id'] === bad)!;
    assert.equal(boom['attempts'], 2);
    assert.match(String(boom['lastError']), /push service down/);
    await s.close();
  });

  test('a job crashed half-way resumes from its saved cursor and finishes; a finished job leaves the queue', async () => {
    const s = await freshStore();
    for (let i = 0; i < 7; i++) await tx(s.store).put('main', encode('config', K.config(`del${i}`), { i })).commit();
    await startJob(tx(s.store), s.store, 'cleanup', 'j1', { removed: 0 }).commit();
    let crash = true;
    const step = async (st: typeof s.store, j: { cursor: string | null; state: Record<string, unknown> }) => {
      const from = j.cursor ? Number(j.cursor) : 0;
      if (from === 3 && crash) { crash = false; throw new Error('killed'); }
      const t = tx(st);
      for (let i = from; i < Math.min(from + 3, 7); i++) t.delete('main', K.config(`del${i}`));
      await t.commit();
      const next = Math.min(from + 3, 7);
      return { cursor: String(next), state: { removed: next }, done: next >= 7 };
    };
    await assert.rejects(runJob(s.store, 'cleanup', 'j1', step), /killed/);
    const mid = await get(s.store, 'main', K.job('cleanup', 'j1'));
    assert.equal(mid?.['cursor'], '3');
    assert.equal(await resumeJobs(s.store, 'cleanup', step), 1);
    for (let i = 0; i < 7; i++) assert.equal(await get(s.store, 'main', K.config(`del${i}`)), undefined);
    const done = await get(s.store, 'main', K.job('cleanup', 'j1'));
    assert.equal(done?.['done'], true);
    assert.deepEqual(done?.['state'], { removed: 7 });
    assert.equal(done?.['G4PK'], undefined, 'off the open-jobs queue');
    assert.equal(await resumeJobs(s.store, 'cleanup', step), 0);
    await s.close();
  });

  test('a second worker that lost the version race stops instead of advancing the job twice', async () => {
    const s = await freshStore();
    await startJob(tx(s.store), s.store, 'race', 'j', {}).commit();
    const ok = await runJob(s.store, 'race', 'j', async () => {
      await update(s.store, 'main', K.job('race', 'j'), { update: 'SET #v = #v + :one', names: { '#v': 'v' }, values: { ':one': 1 } });
      return { done: true };
    });
    assert.equal(ok, false);
    await s.close();
  });

  test('fixtures: writers, test clock and backdate; the DDB harness path drains after each call', async () => {
    const clock = testClock('2026-10-10T08:00:00Z');
    const s = await freshStore({ clock });
    const lid = await listenerItem(s.store, { email: 'A@example.com', displayName: 'Alex' });
    await assert.rejects(listenerItem(s.store, { email: 'a@example.com', displayName: 'Other' }), TxCancelled, 'email is unique');
    await episodeItem(s.store, { id: 'e1', feedUrl: 'https://f.example/x.xml', title: 'One', durationMs: 60_000, publishedAt: '2026-10-01T00:00:00Z' });
    clock.advance(60_000);
    const c = await commentItem(s.store, { episodeId: 'e1', authorId: lid, body: 'hi' });
    assert.equal((await itemAt(s.store, 'comment', c.key))?.['createdAt'], '2026-10-10T08:01:00.000Z');
    await backdate(s.store, 'comment', c.key, 'createdAt', '2026-09-01T00:00:00Z');
    assert.equal((await itemAt(s.store, 'comment', c.key))?.['createdAt'], '2026-09-01T00:00:00.000Z');
    assert.equal(await proveClaimItem(s.store, lid, 'https://f.example/x.xml'), K.feedKey('https://f.example/x.xml'));
    await assert.rejects(proveClaimItem(s.store, lid, 'https://f.example/x.xml'), TxCancelled, 'one proven claim per feed');
    await tx(s.store).put('main', encode('audit', K.audit(clock.iso(), 1), { id: 1, area: 'users' })).commit();
    assert.equal((await auditItems(s.store)).length, 1);
    await s.close();

    if (TEST_BACKEND === 'ddb') {
      const t = await freshDb();
      assert.ok(t.store, 'freshDb attaches a table set');
      const res = await t.call('GET', '/v1/health');
      assert.equal(res.status, 200);
      await t.close();
    }
  });
}
