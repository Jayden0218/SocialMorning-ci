// Tests M23 security: episode PUT needs sign-in, code guesses, rate limits, session expiry, feedback pictures.
/**
 * M23 (specs/024-m23-hardening). Guards and the break that turns each red:
 * - G-M23-1 (US1): a signed-out episode PUT is 401 and a signed-in PUT cannot rename a known episode.
 *   Break: drop `requireAuth` from `episodes.put` (routes/library/episodes.ts), or call
 *   `upsertEpisode` instead of `fillEpisode` there.
 * - G-M23-2 (US2): 50 wrong codes at once — at most 5 are compared, the code is then used up;
 *   wrong passwords in parallel are each counted.
 *   Break: in auth/codes.ts `checkCode`, go back to SELECT-then-compare-then-UPDATE; or in
 *   recordFailedSignIn write `failed_attempts = $n` from the row read before the check.
 * - G-M23-3 (US2/US6): a phone session idle 90 days is refused; an act-as session is refused by
 *   the phone API; last-seen is written at most every 5 minutes.
 *   Break: remove `last_seen_at > now() - …days` or `acting_admin_id IS NULL` from listenerForToken.
 * - G-M23-4 (US3): feedback pictures — signed-out refused (text still taken), 5 a day, a ceiling.
 *   Break: drop the `if (!listener)` or the `imagesSentToday` check in routes/account/feedback.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, TEST_PEPPER, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { hit } from '../src/auth/rate.ts';
import { emailCodeExists, feedbackBodies, feedbackImageCount, listenerByEmailRow, rawSession, sessionLastSeen, setRateCount } from './ac-neutral.ts';

const ep = { feedUrl: 'https://feeds.example.com/m23.xml', guid: 'g1', title: 'The real title', enclosureUrl: 'https://cdn.example.com/1.mp3', imageUrl: 'https://cdn.example.com/real.jpg', publishedAt: '2026-01-01T00:00:00.000Z' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

// M25 S8: a new episode is registered only from its feed, which this fake serves.
const M23_RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>M23</title><item><title>Second</title><guid>g2</guid><enclosure url="https://cdn.example.com/2.mp3" type="audio/mpeg"/></item></channel></rss>`;

test('G-M23-1: a signed-out episode PUT is 401; a signed-in one only fills empty fields', async () => {
  const t = await freshDb({ catalogFetch: (async () => new Response(M23_RSS, { status: 200 })) as unknown as typeof fetch });
  assert.equal((await t.call('PUT', `/v1/episodes/${EP}`, ep)).status, 401);
  await putEpisode(t, EP, ep); // the feed refresh knows it
  const a = await signUp(t, 'a@example.com', 'Al');
  const r = await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, title: 'FAKE', imageUrl: 'https://evil.example/x.jpg', publishedAt: '2099-01-01T00:00:00.000Z', durationMs: 1_000_000 }, a.token);
  assert.equal(r.status, 200);
  const [row] = await t.q<{ title: string; image_url: string; published_at: Date; duration_ms: number }>('SELECT title, image_url, published_at, duration_ms FROM episodes WHERE id = $1', [EP]);
  assert.equal(row!.title, 'The real title', 'title unchanged');
  assert.equal(row!.image_url, ep.imageUrl, 'image unchanged');
  assert.equal(new Date(row!.published_at).toISOString(), ep.publishedAt, 'date unchanged');
  assert.equal(row!.duration_ms, 1_000_000, 'an empty field may be filled');
  // A new episode is still registered by a signed-in listener — from its feed (M25 S8).
  const other = { ...ep, guid: 'g2', title: 'Second' };
  const id2 = fnv1a64(other.feedUrl + '\u0001' + other.guid);
  assert.equal((await t.call('PUT', `/v1/episodes/${id2}`, other, a.token)).status, 200);
  assert.equal((await t.q<{ title: string }>('SELECT title FROM episodes WHERE id = $1', [id2]))[0]!.title, 'Second');
  await t.close();
});

test('G-M23-2: 50 wrong codes at the same moment — at most 5 are checked and the code is used up', async () => {
  const t = await freshDb();
  await t.call('POST', '/v1/auth/code', { email: 'g@example.com' });
  const right = t.lastCode!('g@example.com');
  const wrong = right === '000000' ? '111111' : '000000';
  const answers = await Promise.all(Array.from({ length: 50 }, () => t.call('POST', '/v1/auth/code/verify', { email: 'g@example.com', code: wrong }).then((r) => r.json() as Promise<{ message: string }>)));
  const checked = answers.filter((a) => /not right/.test(a.message)).length;
  assert.ok(checked <= 5, `${checked} wrong guesses were compared`);
  assert.equal(await emailCodeExists(t, 'g@example.com'), false, 'the code is used up');
  assert.equal((await t.call('POST', '/v1/auth/code/verify', { email: 'g@example.com', code: right })).status, 401, 'even the right code is gone');
  await t.close();
});

test('G-M23-2: a right code after 4 wrong ones still works, and still works for the name step', async () => {
  const t = await freshDb();
  await t.call('POST', '/v1/auth/code', { email: 'n@example.com' });
  const right = t.lastCode!('n@example.com');
  const wrong = right === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) await t.call('POST', '/v1/auth/code/verify', { email: 'n@example.com', code: wrong });
  assert.deepEqual(await (await t.call('POST', '/v1/auth/code/verify', { email: 'n@example.com', code: right })).json(), { needsName: true });
  assert.equal((await t.call('POST', '/v1/auth/code/verify', { email: 'n@example.com', code: right, displayName: 'Nia' })).status, 200);
  await t.close();
});

test('G-M23-2: wrong passwords in parallel are each counted', async () => {
  const t = await freshDb();
  await signUp(t, 'p@example.com', 'Pat');
  await Promise.all(Array.from({ length: 8 }, () => t.call('POST', '/v1/auth/sign-in', { email: 'p@example.com', password: 'wrong wrong' })));
  const row = (await listenerByEmailRow(t, 'p@example.com')) as { failed_attempts: number; locked_until: Date | string | null };
  assert.equal(row.failed_attempts, 8);
  // The lock follows the real count (8 → 2^3 s), not each request's stale "0 + 1".
  assert.ok(row.locked_until && new Date(row.locked_until).getTime() > Date.now() + 4_000, 'locked as for 8 failures');
  const next = await t.call('POST', '/v1/auth/sign-in', { email: 'p@example.com', password: 'correct horse' });
  assert.equal(next.status, 429, 'locked even for the right password');
  await t.close();
});

test('FR-003: 10 codes an hour per address, then 429; another address is not affected; a daily total', async () => {
  const t = await freshDb();
  const ask = (email: string, ip: string) => t.call('POST', '/v1/auth/code', { email }, undefined, { 'x-forwarded-for': `${ip}, 10.0.0.1` });
  for (let i = 0; i < 10; i++) assert.equal((await ask(`u${i}@example.com`, '203.0.113.7')).status, 200);
  const eleventh = await ask('u10@example.com', '203.0.113.7');
  assert.equal(eleventh.status, 429);
  assert.match(((await eleventh.json()) as { message: string }).message, /Try again in an hour/);
  assert.equal((await ask('v@example.com', '198.51.100.1')).status, 200, 'a different address');
  // The server-wide daily window: fill it, and the next code is refused.
  await setRateCount(t, 'code:global', 100000);
  assert.equal((await ask('w@example.com', '198.51.100.2')).status, 429);
  await t.close();
});

test('rate counter: parallel hits are all counted', async () => {
  const t = await freshDb();
  const rs = await Promise.all(Array.from({ length: 20 }, () => hit(t.db, 'test:k', 60_000, 5, 1_000_000)));
  assert.equal(rs.filter((r) => r.ok).length, 5);
  await t.close();
});

const MIN = 60_000;
const DAY = 86_400_000;
/** A session row as an older sign-in left it, last seen `lastSeenMs` ago (or an admin's act-as one). */
async function sessionFor(t: TestDb, listenerId: string, extra: { lastSeenMs?: number; actingAdmin?: string } = {}): Promise<string> {
  return rawSession(t, listenerId, { lastSeenMsAgo: extra.lastSeenMs ?? 0, ...(extra.actingAdmin ? { actingAdmin: extra.actingAdmin } : {}) });
}

test('G-M23-3: a session idle 90 days is refused; act-as is refused by the phone API; last-seen moves at most every 5 minutes', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  const admin = await signUp(t, 'admin@example.com', 'Admin');
  assert.equal((await t.call('GET', '/v1/me', undefined, await sessionFor(t, a.id, { lastSeenMs: 89 * DAY }))).status, 200);
  assert.equal((await t.call('GET', '/v1/me', undefined, await sessionFor(t, a.id, { lastSeenMs: 91 * DAY }))).status, 401, 'idle 91 days');
  assert.equal((await t.call('GET', '/v1/me', undefined, await sessionFor(t, a.id, { actingAdmin: admin.id }))).status, 401, 'act-as');

  const recent = await sessionFor(t, a.id, { lastSeenMs: 2 * MIN });
  const before = await sessionLastSeen(t, recent);
  assert.equal((await t.call('GET', '/v1/me', undefined, recent)).status, 200);
  const after = await sessionLastSeen(t, recent);
  assert.equal(after, before, 'not written again within 5 minutes');
  const old = await sessionFor(t, a.id, { lastSeenMs: 6 * MIN });
  await t.call('GET', '/v1/me', undefined, old);
  const moved = Math.floor((Date.now() - (await sessionLastSeen(t, old))) / 1000);
  assert.ok(moved < 60, 'written once 5 minutes old');
  await t.close();
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]).toString('base64');

test('G-M23-4: feedback pictures — signed-out refused (text taken), 5 a day each, and a total ceiling', async () => {
  const t = await freshDb();
  const withPic = { kind: 'x', body: 'look', images: [{ mime: 'image/jpeg', base64: JPEG }] };
  assert.equal((await t.call('POST', '/v1/feedback', withPic)).status, 401, 'pictures need a session');
  assert.equal((await t.call('POST', '/v1/feedback', { kind: 'x', body: 'text only' })).status, 200, 'text still taken');
  assert.equal(await feedbackImageCount(t), 0);

  const a = await signUp(t, 'a@example.com', 'Al');
  for (let i = 0; i < 5; i++) assert.equal((await t.call('POST', '/v1/feedback', withPic, a.token)).status, 200);
  assert.equal((await t.call('POST', '/v1/feedback', withPic, a.token)).status, 429, 'the sixth today');
  assert.equal((await t.call('POST', '/v1/feedback', { kind: 'x', body: 'text is fine' }, a.token)).status, 200);

  const b = await signUp(t, 'b@example.com', 'Bo');
  process.env['FEEDBACK_IMAGE_CEILING_BYTES'] = '50';
  try {
    const full = await t.call('POST', '/v1/feedback', withPic, b.token);
    assert.equal(full.status, 409, 'over the ceiling');
    assert.equal(((await full.json()) as { error: string }).error, 'storage_full');
  } finally {
    delete process.env['FEEDBACK_IMAGE_CEILING_BYTES'];
  }
  // Feedback may carry the phone's last errors (US8), inside the body.
  const r = await t.call('POST', '/v1/feedback', { kind: 'x', body: 'it broke', errors: ['player: timeout', 'sync: 500'] }, b.token);
  assert.equal(r.status, 200);
  const [body] = await feedbackBodies(t, 'it broke');
  assert.match(body!, /Last errors[\s\S]*player: timeout\nsync: 500/);
  await t.close();
});

test('the job token is compared in constant time and still refuses a wrong one', async () => {
  const t = await freshDb({ jobToken: 'right-token' });
  const call = (tok: string) => t.call('POST', '/v1/internal/rebuild', { step: 'digest' }, tok);
  assert.equal((await call('wrong-token')).status, 401);
  assert.equal((await call('right-toke')).status, 401, 'a prefix');
  assert.notEqual((await call('right-token')).status, 401);
  await t.close();
});
