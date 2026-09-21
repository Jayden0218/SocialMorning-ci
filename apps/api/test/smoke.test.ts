import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';

test('GET /v1/health answers { ok: true }; unknown routes are 404 in the error shape', async () => {
  const t = await freshDb();
  const res = await t.call('GET', '/v1/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const nf = await t.call('GET', '/v1/nope');
  assert.equal(nf.status, 404);
  assert.deepEqual(await nf.json(), { error: 'not_found', message: 'No such route.' });
  await t.close();
});
