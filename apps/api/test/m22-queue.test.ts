// Tests queue sync: a write from a stale version is refused with the account's list and changes nothing.
/**
 * M22 US4 (contracts/api.md "Queue"), guard G-M22-3: a PUT whose `baseVersion` is not the stored
 * version answers 409 with the account's list and never overwrites it.
 * The break that turns it red: accept any `baseVersion` in `putQueue`
 * (apps/api/src/db/repos/account/queue.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';

type Q = { items: string[]; version: number; deviceId: string | null; updatedAt: string | null };

test('GET with no queue yet → empty list, version 0; needs a sign-in', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  assert.equal((await t.call('GET', '/v1/me/queue')).status, 401);
  const r = await t.call('GET', '/v1/me/queue', undefined, a.token);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { items: [], version: 0, deviceId: null, updatedAt: null });
  await t.close();
});

test('PUT from the current version is written and the version goes up by one', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const first = await t.call('PUT', '/v1/me/queue', { items: ['e1', 'e2', 'e3'], baseVersion: 0, deviceId: 'phone-a' }, a.token);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { version: 1 });
  const second = await t.call('PUT', '/v1/me/queue', { items: ['e3', 'e1'], baseVersion: 1, deviceId: 'phone-a' }, a.token);
  assert.deepEqual(await second.json(), { version: 2 });
  const q = (await (await t.call('GET', '/v1/me/queue', undefined, a.token)).json()) as Q;
  assert.deepEqual(q.items, ['e3', 'e1']);
  assert.equal(q.version, 2);
  assert.equal(q.deviceId, 'phone-a');
  assert.equal(typeof q.updatedAt, 'string');
  // Each listener has their own queue.
  const b = await signUp(t, 'b@example.com', 'Bea');
  assert.deepEqual(((await (await t.call('GET', '/v1/me/queue', undefined, b.token)).json()) as Q).items, []);
  await t.close();
});

test('G-M22-3: a stale baseVersion → 409 with the account list; nothing is overwritten', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  await t.call('PUT', '/v1/me/queue', { items: ['a1', 'a2', 'a3'], baseVersion: 0, deviceId: 'phone-a' }, a.token);
  // Phone B last saw version 0 and changed its queue offline.
  const stale = await t.call('PUT', '/v1/me/queue', { items: ['b1'], baseVersion: 0, deviceId: 'phone-b' }, a.token);
  assert.equal(stale.status, 409);
  const body = (await stale.json()) as Q & { error: string };
  assert.equal(body.error, 'conflict');
  assert.deepEqual(body.items, ['a1', 'a2', 'a3']);
  assert.equal(body.version, 1);
  assert.equal(body.deviceId, 'phone-a');
  // A base ahead of the server is refused too.
  assert.equal((await t.call('PUT', '/v1/me/queue', { items: [], baseVersion: 5, deviceId: 'phone-b' }, a.token)).status, 409);
  const q = (await (await t.call('GET', '/v1/me/queue', undefined, a.token)).json()) as Q;
  assert.deepEqual(q.items, ['a1', 'a2', 'a3'], 'list unchanged');
  assert.equal(q.version, 1, 'version unchanged');
  // With no row yet, only base 0 is accepted.
  const c = await signUp(t, 'c@example.com', 'Cal');
  assert.equal((await t.call('PUT', '/v1/me/queue', { items: ['x'], baseVersion: 3, deviceId: 'p' }, c.token)).status, 409);
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM queues WHERE listener_id = $1', [c.id]), [{ n: 0 }]);
  await t.close();
});

test('validation: more than 300 items, a missing deviceId, a negative base → 422', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const many = Array.from({ length: 301 }, (_, i) => `e${i}`);
  assert.equal((await t.call('PUT', '/v1/me/queue', { items: many, baseVersion: 0, deviceId: 'p' }, a.token)).status, 422);
  assert.equal((await t.call('PUT', '/v1/me/queue', { items: [], baseVersion: 0 }, a.token)).status, 422);
  assert.equal((await t.call('PUT', '/v1/me/queue', { items: [], baseVersion: -1, deviceId: 'p' }, a.token)).status, 422);
  const ok = Array.from({ length: 300 }, (_, i) => `e${i}`);
  assert.equal((await t.call('PUT', '/v1/me/queue', { items: ok, baseVersion: 0, deviceId: 'p' }, a.token)).status, 200);
  await t.close();
});
