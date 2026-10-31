// Tests the health check and the 404 error shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';

test('GET /v1/health answers { ok: true }; unknown routes are 404 in the error shape', async () => {
  const t = await freshDb();
  const res = await t.call('GET', '/v1/health');
  assert.equal(res.status, 200);
  const hj = await res.json() as Record<string, unknown>;
  assert.equal(hj['ok'], true); assert.equal(hj['db'], 'ok', 'M25 S11: health touches the database');
  assert.ok(['dev', 'qa', 'staging', 'prod'].includes(hj['env'] as string), 'M30: health names its environment');
  const nf = await t.call('GET', '/v1/nope');
  assert.equal(nf.status, 404);
  assert.deepEqual(await nf.json(), { error: 'not_found', message: 'No such route.' });
  await t.close();
});
