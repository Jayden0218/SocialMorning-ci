// Tests sign-in, sign-out, validation errors and account lockout; sign-up by password is gone (M25 S3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, signUpWithCode } from './harness.ts';
import { listenerByEmailRow, setLockedUntil } from './ac-neutral.ts';

test('G-M25-S3: POST /v1/auth/sign-up is gone (404) and makes no account; a code makes one → me → sign-out', async () => {
  const t = await freshDb();
  const gone = await t.call('POST', '/v1/auth/sign-up', { email: 'victim@example.com', password: 'attacker pass 1', displayName: 'Victim' });
  assert.equal(gone.status, 404);
  assert.deepEqual(await gone.json(), { error: 'not_found', message: 'No such route.' });
  assert.equal(await listenerByEmailRow(t, 'victim@example.com'), undefined, 'no account was made');
  // The password the "attacker" chose signs nobody in.
  assert.equal((await t.call('POST', '/v1/auth/sign-in', { email: 'victim@example.com', password: 'attacker pass 1' })).status, 401);

  const made = await signUpWithCode(t, 'A@Example.com', 'Alex');
  assert.equal(made.status, 200);
  const me = await t.call('GET', '/v1/me', undefined, made.token);
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as { listener: { displayName: string } }).listener.displayName, 'Alex');
  assert.equal((await t.call('POST', '/v1/auth/sign-out', undefined, made.token)).status, 200);
  assert.equal((await t.call('GET', '/v1/me', undefined, made.token)).status, 401);
  await t.close();
});

test('validation failures are 422 with field names', async () => {
  const t = await freshDb();
  const res = await t.call('POST', '/v1/auth/code/verify', { email: 'nope', code: '12', displayName: '' });
  assert.equal(res.status, 422);
  const body = (await res.json()) as { error: string; fields: string[] };
  assert.equal(body.error, 'validation');
  assert.deepEqual(body.fields.sort(), ['code', 'displayName', 'email']);
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
  await setLockedUntil(t, new Date(Date.now() - 1000).toISOString());
  const ok = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' });
  assert.equal(ok.status, 200);
  const row = await listenerByEmailRow(t, 'a@example.com');
  assert.equal(row!.failed_attempts, 0, 'success resets the counter');
  await t.close();
});
