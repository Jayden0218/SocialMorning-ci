// M32 A4 (review.md): one slow hourly step must not starve the others — deletions run first, each step gets a share of the time left.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('worker steps (needs DynamoDB Local: DDB_ENDPOINT)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore, TEST_PEPPER } = await import('./harness.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { createWorker, JOB_STEPS } = await import('../src/worker-entry.ts');

  test('deletions is the first step (account deletion is a promise; it cannot wait behind feeds)', () => {
    assert.equal(JOB_STEPS[0], 'deletions');
    assert.deepEqual([...JOB_STEPS].sort(), ['deletions', 'digest', 'feeds', 'health', 'similarity', 'sweep', 'translate']);
  });

  test('a slow feeds step is cut off at its share; deletions (and every later step) still run', async () => {
    const s = await freshStore();
    const db = withStore(undefined, s.store);
    let elapsed = 0; // a fake clock, in ms: the Lambda has 280 s
    const calls: string[] = [];
    const stub = {
      request: async (_p: string, init: RequestInit) => {
        const step = (JSON.parse(String(init.body)) as { step: string }).step;
        calls.push(step);
        if (step === 'feeds') { elapsed += 60_000; return Response.json({ done: false, next: 'again' }); } // never finishes, 60 s a chunk
        elapsed += 1_000;
        return Response.json({ done: true });
      },
    };
    const lines: string[] = [];
    const worker = createWorker({ db, pepper: TEST_PEPPER }, { log: (l) => { lines.push(l); }, jobToken: 't', app: stub });
    const out = await worker({ kind: 'jobs' }, { getRemainingTimeInMillis: () => 280_000 - elapsed });
    assert.deepEqual(out, { ran: [...JOB_STEPS] }, `every step was started: ${lines.join(' | ')}`);
    assert.equal(calls[0], 'deletions');
    assert.ok(calls.includes('deletions'), 'deletions ran');
    const feedsAt = calls.reduce<number[]>((a, c, i) => (c === 'feeds' ? [...a, i] : a), []);
    assert.ok(calls.indexOf('digest') < (feedsAt[2] ?? Infinity), `feeds was cut off at its share: every other step ran before its third chunk: ${calls.join(',')}`);
    for (const step of JOB_STEPS) assert.ok(calls.includes(step), `${step} ran (${calls.join(',')})`);
    assert.ok(lines.some((l) => l.startsWith('feeds:') && l.includes('stopping')), 'the cut-off is logged');
    await s.close();
  });

  test('time the other steps leave unused goes back to feeds, which resumes from its cursor (second pass)', async () => {
    const s = await freshStore();
    const db = withStore(undefined, s.store);
    let elapsed = 0;
    const feedsCursors: (string | undefined)[] = [];
    const stub = {
      request: async (_p: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { step: string; cursor?: string };
        if (body.step === 'feeds') { feedsCursors.push(body.cursor); elapsed += 20_000; return Response.json({ done: feedsCursors.length >= 9, next: `c${feedsCursors.length}` }); }
        elapsed += 1_000;
        return Response.json({ done: true });
      },
    };
    const worker = createWorker({ db, pepper: TEST_PEPPER }, { log: () => {}, jobToken: 't', app: stub });
    await worker({ kind: 'jobs' }, { getRemainingTimeInMillis: () => 280_000 - elapsed });
    assert.ok(feedsCursors.length > 3, `feeds ran past its first share thanks to the leftover time: ${feedsCursors.length} chunks`);
    assert.equal(feedsCursors.filter((c) => c === undefined).length, 1, 'feeds started once and then resumed from its cursor, not from scratch');
    await s.close();
  });
}
