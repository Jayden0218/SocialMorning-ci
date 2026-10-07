// Tests that /v1/health reports maintenance only while MAINTENANCE_UNTIL is in the future.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';

test('M22 T079: /v1/health adds maintenance while MAINTENANCE_UNTIL is in the future', async () => {
  const t = await freshDb();
  const saved = { until: process.env['MAINTENANCE_UNTIL'], message: process.env['MAINTENANCE_MESSAGE'] };
  try {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    process.env['MAINTENANCE_UNTIL'] = until;
    process.env['MAINTENANCE_MESSAGE'] = 'Back soon.';
    assert.deepEqual(await (await t.call('GET', '/v1/health')).json(), { ok: true, maintenance: { until, message: 'Back soon.' } });

    process.env['MAINTENANCE_UNTIL'] = new Date(Date.now() - 1000).toISOString();
    assert.deepEqual(await (await t.call('GET', '/v1/health')).json(), { ok: true });

    process.env['MAINTENANCE_UNTIL'] = 'not a date';
    assert.deepEqual(await (await t.call('GET', '/v1/health')).json(), { ok: true });
  } finally {
    if (saved.until === undefined) delete process.env['MAINTENANCE_UNTIL']; else process.env['MAINTENANCE_UNTIL'] = saved.until;
    if (saved.message === undefined) delete process.env['MAINTENANCE_MESSAGE']; else process.env['MAINTENANCE_MESSAGE'] = saved.message;
    await t.close();
  }
});
