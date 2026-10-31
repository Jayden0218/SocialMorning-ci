// M27 T021 (G-RT2): the worker Lambda on DynamoDB Local — Stream batches, the every-minute drain, the hourly job steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('worker entry (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore, TEST_PEPPER } = await import('./harness.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { tx } = await import('../src/db/ddb/tx.ts');
  const { enqueue, pendingOutbox, registerHandler } = await import('../src/jobs/outbox.ts');
  const { createWorker, JOB_STEPS } = await import('../src/worker-entry.ts');

  let done: string[] = [];
  registerHandler('m27-ok', async (_s, e) => { done.push(e.id); });
  registerHandler('m27-boom', async () => { throw new Error('push service down'); });

  const plenty = { getRemainingTimeInMillis: () => 280_000 };
  const record = (id: string, seq: string) => ({ dynamodb: { SequenceNumber: seq, NewImage: { id: { S: id } } } });

  async function setup() {
    const s = await freshStore();
    const db = withStore(undefined, s.store);
    const lines: string[] = [];
    return { s, db, lines, log: (l: string) => { lines.push(l); } };
  }
  async function put(s: Awaited<ReturnType<typeof freshStore>>, kinds: string[]): Promise<string[]> {
    const t = tx(s.store);
    const ids = kinds.map((kind) => enqueue(t, s.store, { kind }));
    await t.commit();
    return ids;
  }

  test('a Stream batch: processed entries are deleted once; a failing one stays and is reported by sequence number', async () => {
    const { s, db, log } = await setup();
    done = [];
    const [okId, boomId] = await put(s, ['m27-ok', 'm27-boom']);
    const worker = createWorker({ db, pepper: TEST_PEPPER }, { log });
    const out = await worker({ Records: [record(okId!, '100'), record(boomId!, '101')] }, plenty);
    assert.deepEqual(out, { batchItemFailures: [{ itemIdentifier: '101' }] });
    assert.deepEqual(done, [okId], 'the good entry ran exactly once');
    assert.deepEqual((await pendingOutbox(s.store)).map((i) => i['id']), [boomId], 'the failed entry is kept');
    // A retry of the same batch does not run the good entry again (it is gone).
    const again = await worker({ Records: [record(okId!, '100'), record(boomId!, '101')] }, plenty);
    assert.deepEqual(again, { batchItemFailures: [{ itemIdentifier: '101' }] });
    assert.deepEqual(done, [okId]);
    await s.close();
  });

  test('{"kind":"drain"} drains every entry, whichever shard it is in', async () => {
    const { s, db, log } = await setup();
    done = [];
    const ids = await put(s, ['m27-ok', 'm27-ok', 'm27-ok', 'm27-ok', 'm27-ok']);
    const worker = createWorker({ db, pepper: TEST_PEPPER }, { log });
    await worker({ kind: 'drain' }, plenty);
    assert.deepEqual([...done].sort(), [...ids].sort());
    assert.equal((await pendingOutbox(s.store)).length, 0);
    await s.close();
  });

  test('{"kind":"jobs"} runs the seven steps in order (deletions first), follows `next` until done, never logs the cursor', async () => {
    const { s, db, lines, log } = await setup();
    const calls: { step: string; cursor?: string; auth: string | null }[] = [];
    const stub = {
      request: async (path: string, init: RequestInit) => {
        assert.equal(path, '/v1/internal/rebuild');
        const body = JSON.parse(String(init.body)) as { step: string; cursor?: string };
        calls.push({ ...body, auth: new Headers(init.headers).get('authorization') });
        // `feeds` takes three chunks, the others one.
        const more = body.step === 'feeds' && calls.filter((c) => c.step === 'feeds').length < 3;
        return Response.json(more ? { done: false, next: `secret-cursor-${calls.length}`, counts: { feeds: 5 }, ms: 7 } : { done: true, counts: { n: 1 }, ms: 3 });
      },
    };
    const worker = createWorker({ db, pepper: TEST_PEPPER }, { log, jobToken: 'job-token-x', app: stub });
    const out = await worker({ kind: 'jobs' }, plenty);
    assert.equal(JOB_STEPS[0], 'deletions', 'M32 A4: account deletion runs first so a slow feeds step cannot starve it');
    assert.deepEqual(out, { ran: [...JOB_STEPS] });
    assert.deepEqual(calls.map((c) => c.step), ['deletions', 'health', 'feeds', 'feeds', 'feeds', 'sweep', 'similarity', 'translate', 'digest']);
    assert.deepEqual(calls.slice(2, 5).map((c) => c.cursor), [undefined, 'secret-cursor-3', 'secret-cursor-4']);
    assert.ok(calls.every((c) => c.auth === 'Bearer job-token-x'));
    assert.ok(!lines.join('\n').includes('secret-cursor'), 'the cursor is never logged');
    assert.equal(lines.filter((l) => l.startsWith('feeds:')).length, 3);
    await s.close();
  });

  test('{"kind":"jobs"} stops starting work when under 30 s remain, and stops a step that answers an error', async () => {
    const { s, db, lines, log } = await setup();
    const calls: string[] = [];
    const stub = { request: async (_p: string, init: RequestInit) => { const step = (JSON.parse(String(init.body)) as { step: string }).step; calls.push(step); return step === 'sweep' ? Response.json({ error: 'unauthenticated' }, { status: 401 }) : Response.json({ done: true }); } };
    const worker = createWorker({ db, pepper: TEST_PEPPER }, { log, jobToken: 't', app: stub });
    await worker({ kind: 'jobs' }, plenty);
    assert.deepEqual(calls, [...JOB_STEPS], 'a failing step does not stop the next step');
    assert.ok(lines.some((l) => l.startsWith('sweep:') && l.includes('"error":"unauthenticated"')));
    calls.length = 0;
    await worker({ kind: 'jobs' }, { getRemainingTimeInMillis: () => 10_000 });
    assert.deepEqual(calls, [], 'under 30 s left: nothing starts');
    await s.close();
  });

  test('the real app, in-process: the hourly steps all answer done on an empty database', async () => {
    const { s, db, lines, log } = await setup();
    const worker = createWorker({ db, pepper: TEST_PEPPER, jobToken: 'real-token' }, { log });
    const out = await worker({ kind: 'jobs' }, plenty);
    assert.deepEqual(out, { ran: [...JOB_STEPS] });
    for (const step of JOB_STEPS) assert.ok(lines.some((l) => l.startsWith(`${step}: `) && l.includes('"done":true')), `${step}: ${lines.join(' | ')}`);
    await s.close();
  });

  test('an unknown event is ignored, not fatal', async () => {
    const { s, db, lines, log } = await setup();
    const worker = createWorker({ db, pepper: TEST_PEPPER }, { log });
    assert.equal(await worker({ kind: 'nonsense' }, plenty), undefined);
    assert.ok(lines.some((l) => l.includes('ignoring')));
    await s.close();
  });
}
