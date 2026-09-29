/**
 * M11 — the Studio's session walls (specs/011-m11-studio/data-model.md guards).
 *
 * The breaks that turn each red:
 *   G-X1 (no-store everywhere): delete the first `studio.use('*', …)` in `src/routes/studio.ts`.
 *   G-X2 (writes need X-Studio): make `studioCsrf` in `src/auth/studio-session.ts` call `next()` unconditionally.
 *   G-S1 (12 h idle): remove the `STUDIO_IDLE_MS` comparison in `studioListener`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { sCall, studioLogin } from './studio-harness.ts';

test('the session cookie is HttpOnly, SameSite=Strict, Path=/, host-only', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'x@example.com', 'X');
  const s = await t.call('POST', '/v1/auth/sign-in', { email: 'x@example.com', password: 'correct horse', deviceLabel: 'studio-web' });
  const { token } = (await s.json()) as { token: string };
  const res = await t.call('POST', '/v1/studio/session', undefined, token, { 'x-studio': '1' });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie') ?? '';
  assert.match(cookie, /^sm_studio=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/i, 'a Domain attribute would not bind to the Studio host through the proxy');
  const body = (await res.json()) as { token: string; me: { id: string }; shows: unknown[] };
  assert.equal(body.me.id, a.id);
  assert.deepEqual(body.shows, []);
  await t.close();
});

test('a phone token (not studio-web) cannot open the Studio', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'p@example.com', 'P');
  assert.equal((await t.call('POST', '/v1/studio/session', undefined, a.token, { 'x-studio': '1' })).status, 401);
  assert.equal((await t.call('GET', '/v1/studio/me', undefined, a.token)).status, 401);
  await t.close();
});

test('G-X1: every Studio response is private, no-store — success and errors alike', async () => {
  const t = await freshDb();
  const a = await studioLogin(t, 'a@example.com', 'A');
  const ok = await sCall(t, 'GET', '/v1/studio/me', a);
  const unauth = await sCall(t, 'GET', '/v1/studio/me');
  const noRole = await sCall(t, 'GET', '/v1/studio/shows/0000000000000000/overview', a);
  assert.deepEqual([ok.status, unauth.status, noRole.status], [200, 401, 403]);
  for (const r of [ok, unauth, noRole]) assert.equal(r.headers.get('cache-control'), 'private, no-store');
  await t.close();
});

test('G-X2: a write without X-Studio is refused; with it, it works', async () => {
  const t = await freshDb();
  const a = await studioLogin(t, 'a@example.com', 'A');
  const forged = await t.call('POST', '/v1/studio/session/sign-out', undefined, undefined, { cookie: a.cookie });
  assert.equal(forged.status, 403);
  assert.equal(((await forged.json()) as { error: string }).error, 'csrf');
  assert.equal((await sCall(t, 'GET', '/v1/studio/me', a)).status, 200, 'the forged sign-out did nothing');
  assert.equal((await sCall(t, 'POST', '/v1/studio/session/sign-out', a)).status, 204);
  assert.equal((await sCall(t, 'GET', '/v1/studio/me', a)).status, 401, 'signed out means the session row is gone');
  await t.close();
});

test('G-S1: 12 h idle ends the session and deletes it; 11 h 59 min does not', async () => {
  const t = await freshDb();
  const a = await studioLogin(t, 'a@example.com', 'A');
  await t.q("UPDATE sessions SET last_seen_at = now() - interval '11 hours 59 minutes' WHERE device_label = 'studio-web'");
  assert.equal((await sCall(t, 'GET', '/v1/studio/me', a)).status, 200);
  await t.q("UPDATE sessions SET last_seen_at = now() - interval '12 hours 1 minute' WHERE device_label = 'studio-web'");
  const late = await sCall(t, 'GET', '/v1/studio/me', a);
  assert.equal(late.status, 401);
  assert.equal(((await late.json()) as { error: string }).error, 'session_expired');
  assert.equal((await t.q("SELECT 1 FROM sessions WHERE device_label = 'studio-web'")).length, 0);
  await t.close();
});
