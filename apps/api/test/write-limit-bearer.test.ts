// M32 T015 (review B2): a made-up bearer token must not buy a fresh write bucket.
/**
 * Guard G-M32-B2: signed-out writes are limited per network (30 a minute). A client sending a different random
 * `Authorization: Bearer …` on every request used to get a fresh 300/minute bucket each time (keyed on the raw string
 * before it was checked) and so never reached the network limit.
 * Break: in src/auth/write-limit.ts make `resolves` return true.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { freshDb, signUp } from './harness.ts';
import { sCall, studioLogin } from './studio-harness.ts';
import { ageSessions } from './ac-neutral.ts';

test('G-M32-B2: 50 writes, each with a different random Bearer from one network → the 31st is 429', async () => {
  const t = await freshDb();
  const ip = { 'x-forwarded-for': '203.0.113.77' };
  const statuses: number[] = [];
  for (let i = 0; i < 50; i++) {
    const r = await t.call('POST', '/v1/me/playlists', { title: 'x' }, randomBytes(24).toString('base64url'), ip);
    statuses.push(r.status);
  }
  assert.ok(statuses.slice(0, 30).every((s) => s !== 429), `the first 30 are not limited: ${statuses.slice(0, 30)}`);
  assert.equal(statuses[30], 429, `the 31st is limited (statuses: ${statuses.join(',')})`);
  await t.close();
});

test('G-M32-B2: a real session keeps its own bucket — 31 writes from one network are not limited', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const ip = { 'x-forwarded-for': '203.0.113.78' };
  for (let i = 0; i < 35; i++) {
    const r = await t.call('POST', '/v1/me/playlists', { title: `p${i}` }, a.token, ip);
    assert.notEqual(r.status, 429, `write ${i + 1}`);
  }
  await t.close();
});

test('G-M32-B2b: an idle-expired Studio session on a write still gets session_expired (the limiter only looks, never deletes)', async () => {
  const t = await freshDb();
  const a = await studioLogin(t, 'a@example.com', 'A');
  await ageSessions(t, 'last_seen_at', (12 * 60 + 1) * 60_000);
  const late = await sCall(t, 'POST', '/v1/studio/session/sign-out', a);
  assert.equal(late.status, 401);
  assert.equal(((await late.json()) as { error: string }).error, 'session_expired');
  await t.close();
});
