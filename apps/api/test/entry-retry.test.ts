// M32 A3 (review.md): a cold start whose first read of the dependencies fails must not fail every later request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('entry retry (needs DynamoDB Local: DDB_ENDPOINT)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, freshStore, TEST_PEPPER } = await import('./harness.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const lambda = await import('../src/lambda-entry.ts');
  const worker = await import('../src/worker-entry.ts');

  test('the API Lambda: the first dependencies read rejects, the second request still succeeds', async () => {
    const t = await freshDb();
    let reads = 0;
    const handler = lambda.makeHandler(async () => { reads++; if (reads === 1) throw new Error('parameter store throttled'); return { db: t.db, pepper: TEST_PEPPER }; });
    const event = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/lambda-events/health.json', import.meta.url)), 'utf8'));
    await assert.rejects(handler(event, {} as never), /throttled/);
    const res = (await handler(event, {} as never)) as { statusCode: number };
    assert.equal(res.statusCode, 200, 'the second request reads the dependencies again');
    assert.equal(reads, 2);
    await t.close();
  });

  test('the worker: the first dependencies read rejects, the second event still runs', async () => {
    const s = await freshStore();
    const db = withStore(undefined, s.store);
    let reads = 0;
    const handler = worker.makeHandler(async () => { reads++; if (reads === 1) throw new Error('parameter store throttled'); return { db, pepper: TEST_PEPPER }; });
    const lines: string[] = [];
    const log = console.log; console.log = (l: string) => { lines.push(String(l)); };
    try {
      await assert.rejects(handler({ kind: 'drain' }, { getRemainingTimeInMillis: () => 280_000 }), /throttled/);
      await handler({ kind: 'drain' }, { getRemainingTimeInMillis: () => 280_000 });
    } finally { console.log = log; }
    assert.equal(reads, 2);
    assert.ok(lines.some((l) => l.startsWith('outbox drain')), lines.join(' | '));
    await s.close();
  });
}
