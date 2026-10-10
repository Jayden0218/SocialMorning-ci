// Tests M25 lane SA: paid preview, /mod lockout, two-code email change, SSRF guard, word filter, limits, headers, server errors.
/**
 * M25 Phase 1 security (specs/026-m25-control-security-release; docs/plans/m25-audit/plan-security.md).
 * Guards and the break that turns each red (S3's guard is in test/auth.test.ts):
 * - G-M25-S1: a preview link is not the buyer's link and never yields bytes outside the preview.
 *   Break: in routes/creators/paid.ts sign preview links with 'paid-audio' and point them at /audio.
 * - G-M25-S2: /mod/login counts wrong passwords, honours the lock, and limits each address.
 *   Break: in pages/mod.ts drop the `lockedUntil > now` check (or the recordFailedSignIn call).
 * - G-M25-S5: an email change needs the code sent to the OLD address too.
 *   Break: in routes/account/email.ts make `oldOk` always true.
 * - G-M25-S7: no server fetch reaches a private, loopback or metadata address, even by redirect.
 *   Break: in net/safe-fetch.ts make `assertPublicUrl` return at once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { createApp } from '../src/app.ts';
import type { Db } from '../src/db/db.ts';
import { assertPublicUrl, BlockedFetchError, isBlockedAddress, safeFetch } from '../src/net/safe-fetch.ts';
import { HOUR_MS } from '../src/auth/rate.ts';
import { MINUTE_MS } from '../src/auth/write-limit.ts';
import { scrubError } from '../src/routes/errors.ts';
import { errorRows, listenerRow, setLockedUntil, setRateCount } from './ac-neutral.ts';

const json = async <T,>(r: Response | Promise<Response>) => (await (await r).json()) as T;
const windowOf = (ms: number) => new Date(Math.floor(Date.now() / ms) * ms);
/** Fills a rate-limit window, as if `n` requests had already come. */
const fill = (t: TestDb, key: string, ms: number, n: number) =>
  setRateCount(t, key, n, windowOf(ms));

// ---------------------------------------------------------------- S1 paid preview

const TOTAL = 4_000_000;
const AUDIO_URL = 'https://store.example/paid/ep.mp3';

/** A store that answers Range requests over a TOTAL-byte file, and records what was asked. */
function fakeStore() {
  const asked: string[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('range') ?? '';
    asked.push(`${String(input)} ${range}`);
    const m = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!m) return new Response(new Uint8Array(16), { status: 200 });
    const from = Number(m[1]); const to = Number(m[2]);
    return new Response(new Uint8Array(to - from + 1).fill(7), { status: 206, headers: { 'content-range': `bytes ${from}-${to}/${TOTAL}` } });
  }) as typeof fetch;
  return { f, asked };
}

async function paidEpisode(t: TestDb): Promise<string> {
  const owner = await signUp(t, 'host@example.com', 'Host');
  const [s] = await t.q<{ id: string }>("INSERT INTO hosted_shows (owner_id, feed_url, title, price_tier) VALUES ($1, 'https://socialmorning-api.vercel.app/feeds/m25.xml', 'Paid', 2) RETURNING id", [owner.id]);
  const [e] = await t.q<{ id: string }>(
    `INSERT INTO hosted_episodes (show_id, guid, episode_id, title, audio_url, audio_bytes, audio_type, status, published_at, paid, created_at, duration_ms, preview_start_ms, preview_end_ms)
     VALUES ($1, 'g', 'e', 'Ep', $2, $3, 'audio/mpeg', 'published', now() - interval '1 minute', true, now(), 1800000, 600000, 660000) RETURNING id`, [s!.id, AUDIO_URL, TOTAL]);
  return e!.id;
}

test('G-M25-S1: a preview link is its own kind — not the buyer link, never the file address, only the preview bytes', async () => {
  const store = fakeStore();
  const t = await freshDb({ audioFetch: store.f });
  const id = await paidEpisode(t);
  const reply = await t.call('GET', `/v1/hosted/episodes/${id}/preview`);
  assert.equal(reply.status, 200);
  const text = await reply.text();
  assert.ok(!text.includes('store.example'), 'the reply never names the stored file');
  const p = JSON.parse(text) as { url: string; startMs: number; endMs: number };
  assert.match(p.url, new RegExp(`/v1/hosted/episodes/${id}/preview-audio\\?exp=\\d+&sig=[0-9a-f]+$`));
  const q = new URL(p.url).search;
  // The same exp+sig on the buyer's route is refused: the buyer link cannot be derived.
  const buyer = await t.call('GET', `/v1/hosted/episodes/${id}/audio${q}`);
  assert.equal(buyer.status, 402);
  assert.equal(buyer.headers.get('location'), null);
  const path = `/v1/hosted/episodes/${id}/preview-audio${q}`;
  // No Range → the file's first bytes only, 206, never a redirect.
  const first = await t.call('GET', path);
  assert.equal(first.status, 206);
  assert.equal(first.headers.get('content-range'), `bytes 0-${256 * 1024 - 1}/${TOTAL}`);
  assert.equal(first.headers.get('location'), null);
  // Inside the preview's window (10:00–11:00 of 30:00 → bytes ≈ 1 333 333–1 466 666).
  const inside = await t.call('GET', path, undefined, undefined, { range: 'bytes=1400000-1400999' });
  assert.equal(inside.status, 206);
  assert.equal(inside.headers.get('content-range'), `bytes 1400000-1400999/${TOTAL}`);
  assert.equal((await inside.arrayBuffer()).byteLength, 1000);
  // An open range is cut at the window's end.
  const open = await t.call('GET', path, undefined, undefined, { range: 'bytes=1400000-' });
  assert.equal(open.status, 206);
  const [, end] = /bytes 1400000-(\d+)\//.exec(open.headers.get('content-range') ?? '') ?? [];
  assert.ok(Number(end) < 1_800_000, `the window ends near the preview's end, not at ${end}`);
  // Outside the window (the end of the episode, the middle before the preview): 416, the store is not asked.
  const before = store.asked.length;
  for (const r of ['bytes=3000000-3000999', 'bytes=600000-600999', `bytes=${TOTAL - 100}-`]) {
    const out = await t.call('GET', path, undefined, undefined, { range: r });
    assert.equal(out.status, 416, r);
  }
  assert.equal(store.asked.length, before, 'nothing outside the window was read');
  // A tampered signature is refused.
  assert.equal((await t.call('GET', path.replace(/sig=([0-9a-f])/, (_m, c: string) => `sig=${c === '0' ? '1' : '0'}`))).status, 402);
  await t.close();
});

// ---------------------------------------------------------------- S2 /mod/login

const modLogin = (t: TestDb, email: string, password: string, ip?: string) => t.app.request('/mod/login', {
  method: 'POST', redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...(ip ? { 'x-forwarded-for': ip } : {}) },
  body: new URLSearchParams({ email, password }).toString(),
});

test('G-M25-S2: /mod/login counts wrong passwords, refuses a locked owner even with the right one, and limits each address', async () => {
  const t = await freshDb();
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  for (let i = 0; i < 5; i++) assert.equal((await modLogin(t, 'o@example.com', 'wrong password')).status, 403, `try ${i + 1}`);
  const row = (await listenerRow(t, o.id))!;
  assert.equal(row['failed_attempts'], 5, 'every wrong password counted');
  assert.ok(row['locked_until'], 'the fifth locks the account');
  await setLockedUntil(t, new Date(Date.now() + 3_600_000).toISOString(), o.id);
  const locked = await modLogin(t, 'o@example.com', 'correct horse');
  assert.equal(locked.status, 429, 'the right password does not open a locked account');
  assert.equal(locked.headers.get('set-cookie'), null);
  await setLockedUntil(t, null, o.id);
  const ok = await modLogin(t, 'o@example.com', 'correct horse');
  assert.equal(ok.status, 303);
  assert.equal((await listenerRow(t, o.id))!['failed_attempts'], 0, 'a good sign-in clears the count');
  // Per address: 10 an hour, whatever the email.
  for (let i = 0; i < 10; i++) assert.equal((await modLogin(t, `x${i}@example.com`, 'nope', '198.51.100.7')).status, 403);
  assert.equal((await modLogin(t, 'o@example.com', 'correct horse', '198.51.100.7')).status, 429);
  assert.equal((await modLogin(t, 'o@example.com', 'correct horse', '198.51.100.8')).status, 303, 'another address is not blocked');
  await t.close();
});

// ---------------------------------------------------------------- S5 email change

test('G-M25-S5: an email change needs the code sent to the OLD address too; the old address is asked first', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  assert.equal((await t.call('POST', '/v1/me/email/start', { email: 'thief@example.com' }, a.token)).status, 200);
  const toOld = t.mail!.find((m) => m.to === 'a@example.com');
  assert.ok(toOld, 'the current address gets a code');
  assert.match(toOld!.text, /t\*+f@example\.com/, 'and is told where the account would go');
  const code = t.lastCode!('thief@example.com');
  const oldCode = t.lastCode!('a@example.com');
  const wrongOld = oldCode === '000000' ? '111111' : '000000';
  // A stolen session with the new inbox only: refused, nothing changes.
  const noOld = await t.call('POST', '/v1/me/email/confirm', { code }, a.token);
  assert.equal(noOld.status, 422);
  const bad = await t.call('POST', '/v1/me/email/confirm', { code, oldCode: wrongOld }, a.token);
  assert.equal(bad.status, 422);
  assert.deepEqual((await json<{ fields: string[] }>(bad)).fields, ['oldCode']);
  assert.equal((await listenerRow(t, a.id))!['email'], 'a@example.com');
  // Both right: the change is made (and M24's sign-out of other sessions still runs).
  const ok = await t.call('POST', '/v1/me/email/confirm', { code, oldCode }, a.token);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.deepEqual(await ok.json(), { email: 'thief@example.com', signedOut: 0 });
  await t.close();
});

// ---------------------------------------------------------------- S7 SSRF

test('G-M25-S7: the guard refuses private, loopback, link-local and metadata addresses', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::6810:84e5']) assert.equal(isBlockedAddress(ip), false, ip);
  const resolve = async (h: string) => (h === 'evil.example' ? ['10.0.0.7'] : ['93.184.216.34']);
  for (const u of ['http://127.0.0.1/', 'http://localhost:5432/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://2130706433/', 'https://evil.example/feed.xml', 'file:///etc/passwd', 'ftp://example.com/x', 'https://user:pw@example.com/']) {
    await assert.rejects(assertPublicUrl(new URL(u), resolve), BlockedFetchError, u);
  }
  await assertPublicUrl(new URL('https://feeds.example.com/x.xml'), resolve);
  // Size cap and redirect re-check on the wrapper itself.
  const big = safeFetch((async () => new Response(new Uint8Array(4096))) as unknown as typeof fetch, { resolve, maxBytes: 1024 });
  await assert.rejects((await big('https://feeds.example.com/big')).arrayBuffer());
  const hops: string[] = [];
  const redirecting = safeFetch((async (u: string) => { hops.push(u); return new Response(null, { status: 302, headers: { location: 'http://10.9.8.7/internal' } }); }) as unknown as typeof fetch, { resolve });
  await assert.rejects(redirecting('https://feeds.example.com/moved'), BlockedFetchError);
  assert.deepEqual(hops, ['https://feeds.example.com/moved'], 'the private hop was never fetched');
});

test('G-M25-S7: episode registration and claim checks never fetch a private address', async () => {
  const fetched: string[] = [];
  const catalogFetch = (async (input: string | URL | Request) => {
    fetched.push(String(input));
    if (String(input).includes('moved.example')) return new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/latest/' } });
    return new Response('<rss version="2.0"><channel><title>x</title></channel></rss>', { status: 200 });
  }) as typeof fetch;
  const t = await freshDb({ catalogFetch, resolveHost: async (h) => (h === 'evil.example' ? ['192.168.0.10'] : ['93.184.216.34']) });
  const a = await signUp(t);
  for (const feedUrl of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:8787/v1/internal', 'http://localhost/feed', 'https://evil.example/feed.xml']) {
    const id = fnv1a64(`${feedUrl}\u0001g1`);
    const r = await t.call('PUT', `/v1/episodes/${id}`, { feedUrl, guid: 'g1', title: 'x', enclosureUrl: 'https://cdn.example.com/1.mp3' }, a.token);
    assert.equal(r.status, 404, feedUrl);
    const claim = await json<{ id: string }>(t.call('POST', '/v1/creator/claims', { feedUrl }, a.token));
    const v = await t.call('POST', `/v1/creator/claims/${claim.id}/verify`, undefined, a.token);
    assert.equal((await json<{ status: string }>(v)).status, 'pending', feedUrl);
  }
  assert.deepEqual(fetched, [], 'not one private address was fetched');
  // A public feed that redirects to the metadata address: the first hop only.
  const moved = 'https://moved.example/feed.xml';
  assert.equal((await t.call('PUT', `/v1/episodes/${fnv1a64(`${moved}\u0001g1`)}`, { feedUrl: moved, guid: 'g1', title: 'x', enclosureUrl: 'https://cdn.example.com/1.mp3' }, a.token)).status, 404);
  assert.ok(fetched.length > 0 && fetched.every((u) => u === moved), fetched.join(' '));
  await t.close();
});

// ---------------------------------------------------------------- S8 episodes come from feeds

test('S8: a listener cannot register an episode its feed does not list; a listed one takes the FEED\'s words', async () => {
  const FEED = 'https://feeds.example.com/m25.xml';
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Real Show</title><item><title>Real title</title><guid>real</guid><enclosure url="https://cdn.example.com/real.mp3" type="audio/mpeg"/></item></channel></rss>`;
  const t = await freshDb({ catalogFetch: (async () => new Response(rss, { status: 200 })) as unknown as typeof fetch });
  const a = await signUp(t);
  const fake = fnv1a64(`${FEED}\u0001made-up`);
  const r1 = await t.call('PUT', `/v1/episodes/${fake}`, { feedUrl: FEED, guid: 'made-up', title: 'Buy pills', enclosureUrl: 'https://evil.example/x.mp3', imageUrl: 'https://evil.example/x.jpg' }, a.token);
  assert.equal(r1.status, 404);
  assert.equal((await t.q('SELECT 1 FROM episodes WHERE id = $1', [fake])).length, 0, 'nothing was written');
  const real = fnv1a64(`${FEED}\u0001real`);
  const r2 = await t.call('PUT', `/v1/episodes/${real}`, { feedUrl: FEED, guid: 'real', title: 'FAKE', enclosureUrl: 'https://evil.example/x.mp3', imageUrl: 'https://evil.example/x.jpg', durationMs: 1_234_000 }, a.token);
  assert.equal(r2.status, 200, await r2.clone().text());
  const [row] = await t.q<{ title: string; enclosure_url: string; image_url: string | null; duration_ms: number }>('SELECT title, enclosure_url, image_url, duration_ms FROM episodes WHERE id = $1', [real]);
  assert.deepEqual([row!.title, row!.enclosure_url, row!.image_url, row!.duration_ms], ['Real title', 'https://cdn.example.com/real.mp3', null, 1_234_000]);
  await t.close();
});

// ---------------------------------------------------------------- S4 word filter

test('S4: blocked words are refused for +json bodies, voice transcripts, Studio replies, announcements, polls, show details and appeals', async () => {
  const t = await freshDb();
  await putEpisode(t, 'e1', { feedUrl: 'https://feeds.example.com/w.xml', guid: 'g', title: 'T', enclosureUrl: 'https://cdn.example.com/1.mp3', durationMs: 600_000 });
  const a = await signUp(t);
  await t.q("INSERT INTO blocked_words (word) VALUES ('badword')");
  const refused: [string, string, string | undefined, Record<string, string>, unknown][] = [
    ['POST', '/v1/episodes/e1/comments', a.token, { 'content-type': 'application/vnd.x+json' }, { body: 'you badword', offsetMs: 1 }],
    ['POST', '/v1/episodes/e1/comments', a.token, { 'content-type': 'application/json; charset=utf-8' }, { body: 'you badword', offsetMs: 1 }],
    ['POST', '/v1/voice-posts', a.token, { 'content-type': 'audio/mp4', 'x-transcript': encodeURIComponent('a badword here') }, undefined],
    ['POST', '/v1/episodes/e1/comments/voice', a.token, { 'content-type': 'audio/mp4', 'x-transcript': encodeURIComponent('badword') }, undefined],
    ['POST', '/v1/studio/shows/k/comments/c1/reply', undefined, { 'content-type': 'application/json' }, { body: 'badword' }],
    ['POST', '/v1/studio/shows/k/announcements', undefined, { 'content-type': 'application/json' }, { body: 'badword sale' }],
    ['POST', '/v1/studio/shows/k/polls', undefined, { 'content-type': 'application/json' }, { question: 'Which?', options: ['fine', 'badword'], endsAt: '2099-01-01T00:00:00.000Z' }],
    ['POST', '/v1/studio/hosted-shows', undefined, { 'content-type': 'application/json' }, { title: 'The Badword Hour' }],
    ['PUT', '/v1/studio/shows/k/details', undefined, { 'content-type': 'application/json' }, { description: 'badword' }],
    ['PUT', '/v1/studio/shows/k/overrides', undefined, { 'content-type': 'application/json' }, { milestoneMessage: 'badword' }],
    ['POST', '/v1/studio/shows/k/hosted-episodes', undefined, { 'content-type': 'application/json' }, { title: 'badword', audioUrl: 'https://x.example/a.mp3' }],
    ['POST', '/v1/appeals', a.token, { 'content-type': 'application/json' }, { actionId: '00000000-0000-0000-0000-000000000000', text: 'badword' }],
  ];
  for (const [method, path, token, headers, body] of refused) {
    const res = await t.app.request(path, { method, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? new Uint8Array(8) : JSON.stringify(body) });
    assert.equal(res.status, 422, `${method} ${path}`);
    assert.equal((await json<{ error: string }>(res)).error, 'blocked_word', `${method} ${path}`);
  }
  await t.close();
});

// ---------------------------------------------------------------- S6 limits

test('S6: sign-in is limited per address and in total; signed-out feedback per address; every write per session', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const ip = { 'x-forwarded-for': '203.0.113.50' };
  await fill(t, 'signin:ip:203.0.113.50', HOUR_MS, 30);
  assert.equal((await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' }, undefined, ip)).status, 429);
  assert.equal((await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' }, undefined, { 'x-forwarded-for': '203.0.113.51' })).status, 200);
  await fill(t, 'signin:global', HOUR_MS, 3000);
  assert.equal((await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' }, undefined, { 'x-forwarded-for': '203.0.113.52' })).status, 429);
  for (let i = 0; i < 10; i++) assert.equal((await t.call('POST', '/v1/feedback', { kind: 'idea', body: `note ${i}` }, undefined, { 'x-forwarded-for': '203.0.113.60' })).status, 200, `feedback ${i + 1}`);
  assert.equal((await t.call('POST', '/v1/feedback', { kind: 'idea', body: 'one more' }, undefined, { 'x-forwarded-for': '203.0.113.60' })).status, 429);
  // The floor on every write: 300 a minute for one session.
  const key = createHash('sha256').update(a.token).digest('base64url').slice(0, 22);
  await fill(t, `w:s:${key}`, MINUTE_MS, 300);
  const capped = await t.call('POST', '/v1/me/playlists', { title: 'Mix' }, a.token);
  assert.equal(capped.status, 429);
  assert.equal((await json<{ error: string }>(capped)).error, 'locked');
  assert.equal((await t.call('GET', '/v1/me', undefined, a.token)).status, 200, 'reads are not counted');
  await t.close();
});

// ---------------------------------------------------------------- S9 headers

test('S9: GET / answers 200; every response carries CSP, X-Frame-Options, nosniff and Referrer-Policy', async () => {
  const t = await freshDb();
  const root = await t.call('GET', '/');
  assert.equal(root.status, 200);
  assert.deepEqual(await root.json(), { name: 'SocialNet API', health: '/v1/health' });
  for (const path of ['/', '/v1/health', '/v1/nope', '/privacy']) {
    const r = await t.call('GET', path);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer', path);
    const csp = r.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'none'/, path);
    assert.match(csp, /frame-ancestors 'none'/, path);
    assert.doesNotMatch(csp, /script-src/, `${path}: no script is allowed anywhere`);
  }
  assert.match((await t.call('GET', '/privacy')).headers.get('content-security-policy') ?? '', /style-src 'unsafe-inline'/);
  await t.close();
});

// ---------------------------------------------------------------- S11 server errors

test('S11: an unhandled error is kept as scope server with no personal data; a new one emails the owner once an hour; health touches the db', async () => {
  const t = await freshDb();
  const o = await signUp(t, 'owner@example.com', 'Owner');
  t.setOwner!(o.id);
  let n = 0;
  t.app.get('/v1/__boom', () => { throw new Error(`boom ${++n > 1 ? 'again' : ''} for a@example.com, code 123456, Bearer abc.def`); });
  t.app.get('/v1/__bang', () => { throw new TypeError('bang'); });
  const r = await t.call('GET', '/v1/__boom');
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: 'internal', message: 'Something went wrong on our side.' });
  const rows = await errorRows(t, 'server');
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.message, /^GET \S+: Error: boom +for <email>, code <n>, Bearer <redacted>$/);
  assert.deepEqual([rows[0]!.platform, rows[0]!.listener_id], ['server', null]);
  const alerts = () => t.mail!.filter((m) => m.subject === 'SocialNet: a new server error');
  assert.equal(alerts().length, 1);
  assert.equal(alerts()[0]!.to, 'owner@example.com');
  assert.ok(!alerts()[0]!.text.includes('a@example.com'));
  await t.call('GET', '/v1/__boom'); // a new text ("again"), so a new row — but this hour's email is spent
  await t.call('GET', '/v1/__bang');
  assert.equal(alerts().length, 1, 'at most one alert an hour');
  assert.equal((await errorRows(t, 'server')).length, 3);
  assert.equal(scrubError('see https://x.example/feed?token=abcdef'), 'see https://x.example/feed?<query>');

  const broken = { ...t.db, query: async () => { throw new Error('database down'); } } as unknown as Db;
  const down = createApp({ db: broken, pepper: 'p' });
  const h = await down.request('/v1/health');
  assert.equal(h.status, 503);
  assert.deepEqual(await h.json(), { ok: false, db: 'fail' });
  await t.close();
});
