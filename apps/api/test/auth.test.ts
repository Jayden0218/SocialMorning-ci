import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';

test('sign-up → me → sign-out; duplicate email is 409 with the exact message', async () => {
  const t = await freshDb();
  const { token } = await signUp(t);
  const me = await t.call('GET', '/v1/me', undefined, token);
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as { listener: { displayName: string } }).listener.displayName, 'Alex');

  const dup = await t.call('POST', '/v1/auth/sign-up', { email: 'A@Example.com', password: 'whatever12', displayName: 'B' });
  assert.equal(dup.status, 409);
  assert.deepEqual(await dup.json(), { error: 'conflict', message: 'An account with this email exists — sign in instead.' });

  assert.equal((await t.call('POST', '/v1/auth/sign-out', undefined, token)).status, 200);
  assert.equal((await t.call('GET', '/v1/me', undefined, token)).status, 401);
  await t.close();
});

test('validation failures are 422 with field names', async () => {
  const t = await freshDb();
  const res = await t.call('POST', '/v1/auth/sign-up', { email: 'nope', password: 'short', displayName: '' });
  assert.equal(res.status, 422);
  const body = (await res.json()) as { error: string; fields: string[] };
  assert.equal(body.error, 'validation');
  assert.deepEqual(body.fields.sort(), ['displayName', 'email', 'password']);
  await t.close();
});

// quickstart A14
test('unknown email and wrong password produce byte-identical 401 bodies', async () => {
  const t = await freshDb();
  await signUp(t);
  const unknown = await t.call('POST', '/v1/auth/sign-in', { email: 'nobody@example.com', password: 'x'.repeat(10) });
  const wrong = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'x'.repeat(10) });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(await unknown.text(), await wrong.text());
  await t.close();
});

// quickstart A13
test('five wrong passwords lock the account; the lock expires; the right password then works', async () => {
  const t = await freshDb();
  await signUp(t);
  for (let i = 0; i < 5; i++) {
    const r = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'wrong-wrong' });
    assert.equal(r.status, 401, `attempt ${i + 1}`);
  }
  const locked = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' });
  assert.equal(locked.status, 429);
  const body = (await locked.json()) as { error: string; retryAfterSeconds: number };
  assert.equal(body.error, 'locked');
  assert.ok(body.retryAfterSeconds >= 1 && body.retryAfterSeconds <= 2, `retryAfterSeconds=${body.retryAfterSeconds}`);

  // Expire the lock by moving it into the past rather than sleeping.
  await t.q("UPDATE listeners SET locked_until = now() - interval '1 second'");
  const ok = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' });
  assert.equal(ok.status, 200);
  const [row] = await t.q<{ failed_attempts: number }>('SELECT failed_attempts FROM listeners');
  assert.equal(row!.failed_attempts, 0, 'success resets the counter');
  await t.close();
});
