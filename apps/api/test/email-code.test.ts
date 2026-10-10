// Tests email code sign-in: new and known emails, wrong codes, single use.
/**
 * Email-code sign-in (owner, 2026-09-27): no password anywhere in the app.
 * Breaks that turn these red: accept any code in `checkCode`; drop the attempts check;
 * skip `consumeCode` after a sign-in; answer differently for a new and a known email.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { setEmailCodeTime } from './ac-neutral.ts';

const lastCode = (t: TestDb, to: string): string => t.lastCode!(to);

type Session = { token: string; listener: { id: string; displayName: string } };

test('a new email: code → needsName → name → signed in; the code is then used up', async () => {
  const t = await freshDb();
  assert.equal((await t.call('POST', '/v1/auth/code', { email: 'New@Example.com' })).status, 200);
  const code = lastCode(t, 'new@example.com');
  const first = await t.call('POST', '/v1/auth/code/verify', { email: 'new@example.com', code });
  assert.deepEqual(await first.json(), { needsName: true });
  const done = await t.call('POST', '/v1/auth/code/verify', { email: 'new@example.com', code, displayName: 'Nia' });
  assert.equal(done.status, 200);
  const s = (await done.json()) as Session;
  assert.equal(s.listener.displayName, 'Nia');
  assert.equal((await t.call('GET', '/v1/me', undefined, s.token)).status, 200);
  // Used up: the same code does not work twice.
  assert.equal((await t.call('POST', '/v1/auth/code/verify', { email: 'new@example.com', code })).status, 401);
  await t.close();
});

test('a known email signs straight in with its code, no name asked', async () => {
  const t = await freshDb();
  const { id } = await signUp(t);
  await t.call('POST', '/v1/auth/code', { email: 'a@example.com' });
  const r = await t.call('POST', '/v1/auth/code/verify', { email: 'a@example.com', code: lastCode(t, 'a@example.com') });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as Session).listener.id, id);
  await t.close();
});

test('asking for a code answers the same for a known and an unknown email', async () => {
  const t = await freshDb();
  await signUp(t);
  const known = await t.call('POST', '/v1/auth/code', { email: 'a@example.com' });
  const unknown = await t.call('POST', '/v1/auth/code', { email: 'b@example.com' });
  assert.equal(known.status, unknown.status);
  assert.equal(await known.text(), await unknown.text());
  await t.close();
});

test('a wrong code is refused; five wrong tries end the code, even the right one', async () => {
  const t = await freshDb();
  await t.call('POST', '/v1/auth/code', { email: 'c@example.com' });
  const right = lastCode(t, 'c@example.com');
  const wrong = right === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    const r = await t.call('POST', '/v1/auth/code/verify', { email: 'c@example.com', code: wrong });
    assert.equal(r.status, 401, `try ${i + 1}`);
  }
  const late = await t.call('POST', '/v1/auth/code/verify', { email: 'c@example.com', code: right, displayName: 'C' });
  assert.equal(late.status, 401);
  assert.match(((await late.json()) as { message: string }).message, /expired/);
  await t.close();
});

test('an expired code is refused', async () => {
  const t = await freshDb();
  await t.call('POST', '/v1/auth/code', { email: 'd@example.com' });
  await setEmailCodeTime(t, 'expires_at', new Date(Date.now() - 1000).toISOString());
  const r = await t.call('POST', '/v1/auth/code/verify', { email: 'd@example.com', code: lastCode(t, 'd@example.com'), displayName: 'D' });
  assert.equal(r.status, 401);
  await t.close();
});

test('a second code within 30 s is refused with the wait; after it, a new code replaces the old', async () => {
  const t = await freshDb();
  await t.call('POST', '/v1/auth/code', { email: 'e@example.com' });
  const old = lastCode(t, 'e@example.com');
  const again = await t.call('POST', '/v1/auth/code', { email: 'e@example.com' });
  assert.equal(again.status, 429);
  assert.ok(((await again.json()) as { retryAfterSeconds: number }).retryAfterSeconds >= 1);
  await setEmailCodeTime(t, 'sent_at', new Date(Date.now() - 31_000).toISOString());
  assert.equal((await t.call('POST', '/v1/auth/code', { email: 'e@example.com' })).status, 200);
  const fresh = lastCode(t, 'e@example.com');
  if (fresh !== old) {
    assert.equal((await t.call('POST', '/v1/auth/code/verify', { email: 'e@example.com', code: old, displayName: 'E' })).status, 401);
  }
  assert.equal((await t.call('POST', '/v1/auth/code/verify', { email: 'e@example.com', code: fresh, displayName: 'E' })).status, 200);
  await t.close();
});

test('with no mailer configured, asking for a code is 503, never a crash', async () => {
  const t = await freshDb({ noMailer: true });
  const r = await t.call('POST', '/v1/auth/code', { email: 'f@example.com' });
  assert.equal(r.status, 503);
  await t.close();
});

test('delete account confirms with a code sent to the account email', async () => {
  const t = await freshDb();
  const { token } = await signUp(t);
  await t.call('POST', '/v1/auth/code', { email: 'a@example.com' });
  assert.equal((await t.call('DELETE', '/v1/me', { code: '999999' === lastCode(t, 'a@example.com') ? '888888' : '999999' }, token)).status, 401);
  assert.equal((await t.call('DELETE', '/v1/me', { code: lastCode(t, 'a@example.com') }, token)).status, 202, 'M22 US11: the deletion waits 15 days');
  assert.equal((await t.call('GET', '/v1/me', undefined, token)).status, 401);
  await t.close();
});
