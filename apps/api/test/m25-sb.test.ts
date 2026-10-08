// Tests M25 lane SB: signed-in devices, session lifetime and rotation, the admin second factor, picture metadata, CSV formulas, data export, test purchases, secret rotation.
/**
 * Guards (each was broken on mirror branch `lane-sb-red`, seen red, then restored):
 * - G-SB1 devices: a revoked device's token is refused at once.
 *     Break: in routes/account/devices.ts DELETE /:id, delete nothing (drop the DELETE statement).
 * - G-SB2 admin second factor: no code → no Admin (Studio and /mod).
 *     Break: in auth/admin.ts adminOnly, skip the `secondFactorDone` check.
 * - G-SB3 picture metadata: a JPEG with GPS is stored without it (server half; the byte rules are
 *     packages/social-core/test/image-meta.test.ts).
 *     Break: in routes/account/me.ts PUT /avatar, store `raw` instead of the stripped bytes.
 * - G-SB4 CSV: a title starting with = is written as text, not a formula.
 *     Break: in db/repos/studio/studio-numbers.ts `csvSafe`, return `s`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, TEST_PEPPER, type TestDb } from './harness.ts';
import { addEpisode, noon, proveClaim, sCall, studioLogin, studioLoginNoFactor, type StudioUser } from './studio-harness.ts';
import { createApp } from '../src/app.ts';
import { toCsv } from '../src/db/repos/studio/studio-numbers.ts';
import { exportLinkToken } from '../src/routes/account/data-export.ts';
import type { GooglePlay } from '../src/billing/google-play.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';

type Device = { id: string; kind: string; label: string; country: string | null; current: boolean };

const signIn = async (t: TestDb, email: string, deviceLabel?: string, country?: string): Promise<string> => {
  const r = await t.call('POST', '/v1/auth/sign-in', { email, password: 'correct horse', ...(deviceLabel ? { deviceLabel } : {}) }, undefined, country ? { 'x-vercel-ip-country': country } : {});
  assert.equal(r.status, 200);
  return ((await r.json()) as { token: string }).token;
};
const devices = async (t: TestDb, token: string) => ((await (await t.call('GET', '/v1/me/sessions', undefined, token)).json()) as { items: Device[] }).items;

// ---------------------------------------------------------------- G-SB1 devices

test('G-SB1: Devices lists this account\'s sessions with label, country and "this phone"; a revoked token is refused at once; sign out the others keeps this one', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  const pixel = await signIn(t, 'a@example.com', 'Pixel 8', 'MY');
  const iphone = await signIn(t, 'a@example.com', 'iPhone 15', 'SG');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const list = await devices(t, pixel);
  assert.equal(list.length, 3, 'three sessions of this account, none of B\'s');
  assert.deepEqual([list[0]!.label, list[0]!.country, list[0]!.current, list[0]!.kind], ['Pixel 8', 'MY', true, 'phone'], 'this phone first');
  const other = list.find((d) => d.label === 'iPhone 15')!;
  assert.equal(other.country, 'SG');
  assert.equal(other.current, false);
  assert.equal((await t.call('DELETE', `/v1/me/sessions/${other.id}`, undefined, b.token)).status, 404, 'not someone else\'s device');
  assert.equal((await t.call('DELETE', `/v1/me/sessions/${list[0]!.id}`, undefined, pixel)).status, 422, 'not the phone in your hand');
  assert.equal((await t.call('GET', '/v1/me', undefined, iphone)).status, 200);
  assert.equal((await t.call('DELETE', `/v1/me/sessions/${other.id}`, undefined, pixel)).status, 204);
  assert.equal((await t.call('GET', '/v1/me', undefined, iphone)).status, 401, 'the revoked token is refused at once');
  assert.equal((await devices(t, pixel)).length, 2);
  const out = (await (await t.call('POST', '/v1/me/sessions/sign-out-others', undefined, pixel)).json()) as { signedOut: number };
  assert.equal(out.signedOut, 1);
  assert.equal((await t.call('GET', '/v1/me', undefined, a.token)).status, 401);
  assert.equal((await t.call('GET', '/v1/me', undefined, pixel)).status, 200, 'this phone stays signed in');
  assert.equal((await t.call('GET', '/v1/me', undefined, b.token)).status, 200, 'another account is untouched');
  await t.close();
});

// ---------------------------------------------------------------- lifetime and rotation

test('sessions: rotated at most once a day when the phone asks, the old token works for the grace window only; 180 days is the most a session lives', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  await t.q("UPDATE sessions SET rotated_at = now() - interval '2 days'");
  const plain = await t.call('GET', '/v1/me', undefined, a.token);
  assert.equal(plain.headers.get('x-session-token'), null, 'an older build never asks, and is never rotated');
  const asked = await t.call('GET', '/v1/me', undefined, a.token, { 'x-session-rotate': '1' });
  const fresh = asked.headers.get('x-session-token');
  assert.ok(fresh && fresh !== a.token, 'a new token');
  assert.equal(asked.headers.get('cache-control')?.includes('no-store'), true);
  const again = await t.call('GET', '/v1/me', undefined, fresh!, { 'x-session-rotate': '1' });
  assert.equal(again.headers.get('x-session-token'), null, 'not twice in a day');
  assert.equal((await t.call('GET', '/v1/me', undefined, a.token)).status, 200, 'the old token still works in the grace window');
  const list = await devices(t, a.token);
  assert.equal(list.length, 1, 'one device, not two');
  assert.equal(list[0]!.current, true, 'the old token still finds its own (new) row as "this phone"');
  await t.q("UPDATE sessions SET replaced_at = now() - interval '3 minutes' WHERE replaced_at IS NOT NULL");
  assert.equal((await t.call('GET', '/v1/me', undefined, a.token)).status, 401, 'past the grace window the old token is refused');
  assert.equal((await t.call('GET', '/v1/me', undefined, fresh!)).status, 200);
  // Signing the new one out takes the old one with it.
  const [n] = await t.q<{ n: number }>('SELECT count(*)::int AS n FROM sessions');
  assert.equal(n!.n, 2);
  await t.call('POST', '/v1/auth/sign-out', undefined, fresh!);
  assert.equal((await t.q<{ n: number }>('SELECT count(*)::int AS n FROM sessions'))[0]!.n, 0);
  // The absolute lifetime, however busy the session was.
  const b = await signUp(t, 'b@example.com', 'Bo');
  await t.q("UPDATE sessions SET created_at = now() - interval '179 days'");
  assert.equal((await t.call('GET', '/v1/me', undefined, b.token)).status, 200);
  await t.q("UPDATE sessions SET created_at = now() - interval '181 days'");
  assert.equal((await t.call('GET', '/v1/me', undefined, b.token)).status, 401);
  await t.close();
});

test('the Studio cookie rotates once a day too, and the new cookie works', async () => {
  const t = await freshDb();
  const u = await studioLogin(t, 's@example.com', 'Sam');
  await t.q("UPDATE sessions SET rotated_at = now() - interval '2 days'");
  const r = await sCall(t, 'GET', '/v1/studio/me', u);
  assert.equal(r.status, 200);
  const set = r.headers.get('set-cookie') ?? '';
  assert.match(set, /^sm_studio=/);
  const cookie = set.split(';')[0]!;
  assert.notEqual(cookie, u.cookie);
  assert.equal((await sCall(t, 'GET', '/v1/studio/me', { ...u, cookie })).status, 200);
  assert.equal((await sCall(t, 'GET', '/v1/studio/me', u)).status, 200, 'the old cookie in the grace window');
  await t.close();
});

// ---------------------------------------------------------------- G-SB2 admin second factor

const cookieOf = (r: Response, name: string) => (r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie') ?? '']).find((c) => c.startsWith(`${name}=`))?.split(';')[0];

test('G-SB2: Admin needs the emailed code — no code, no Admin; a wrong code does not open it; the right one does; "remember" lets a new session on this browser skip it', async () => {
  const t = await freshDb();
  const owner = await studioLoginNoFactor(t, 'owner@example.com', 'Owner');
  t.setOwner!(owner.id);
  const refused = await sCall(t, 'GET', '/v1/admin/audit', owner);
  assert.equal(refused.status, 403);
  assert.equal(((await refused.json()) as { error: string }).error, 'second_factor', 'the password alone gives no Admin');
  assert.deepEqual(await (await sCall(t, 'GET', '/v1/studio/second-factor', owner)).json(), { needed: true });
  const stranger = await studioLogin(t, 'x@example.com', 'X');
  assert.equal((await sCall(t, 'POST', '/v1/studio/second-factor/send', stranger)).status, 403, 'only an admin is sent a code');
  assert.deepEqual(await (await sCall(t, 'GET', '/v1/studio/second-factor', stranger)).json(), { needed: false });
  assert.equal((await sCall(t, 'POST', '/v1/studio/second-factor/send', owner)).status, 200);
  assert.equal((await sCall(t, 'POST', '/v1/studio/second-factor/send', owner)).status, 429, '30 s between codes');
  const code = t.lastCode!('owner@example.com');
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await sCall(t, 'POST', '/v1/studio/second-factor/verify', owner, { code: wrong })).status, 422);
  assert.equal((await sCall(t, 'GET', '/v1/admin/audit', owner)).status, 403, 'a wrong code opens nothing');
  const ok = await sCall(t, 'POST', '/v1/studio/second-factor/verify', owner, { code, remember: true });
  assert.equal(ok.status, 200);
  const device = cookieOf(ok, 'sm_device');
  assert.ok(device, 'the remember-this-browser cookie');
  assert.equal((await sCall(t, 'GET', '/v1/admin/audit', owner)).status, 200, 'the right code opens Admin');
  assert.equal((await sCall(t, 'POST', '/v1/studio/second-factor/verify', owner, { code })).status, 422, 'a code works once');

  // A new Studio session (password again) on the same browser: the remembered device skips the code;
  // without the cookie it is asked again.
  const fresh = async (): Promise<StudioUser> => {
    const token = ((await (await t.call('POST', '/v1/auth/sign-in', { email: 'owner@example.com', password: 'correct horse', deviceLabel: 'studio-web' })).json()) as { token: string }).token;
    const s = await t.call('POST', '/v1/studio/session', undefined, token, { 'x-studio': '1' });
    return { id: owner.id, token, cookie: cookieOf(s, 'sm_studio')! };
  };
  const bare = await fresh();
  assert.equal((await sCall(t, 'GET', '/v1/admin/audit', bare)).status, 403);
  const remembered = await fresh();
  assert.equal((await sCall(t, 'GET', '/v1/admin/audit', { ...remembered, cookie: `${remembered.cookie}; ${device}` })).status, 200);
  // The cookie is for this account only.
  const tampered = device!.replace(owner.id, stranger.id);
  const third = await fresh();
  assert.equal((await sCall(t, 'GET', '/v1/admin/audit', { ...third, cookie: `${third.cookie}; ${tampered}` })).status, 403);
  await t.close();
});

test('G-SB2: /mod opens only after the emailed code; a code sign-in to the Studio counts as the second factor', async () => {
  const t = await freshDb();
  const o = await signUp(t, 'o@example.com', 'Owner');
  t.setOwner!(o.id);
  const form = (f: Record<string, string>) => new URLSearchParams(f).toString();
  const web = (path: string, body?: Record<string, string>, cookie?: string) => t.app.request(path, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(cookie ? { cookie } : {}) }, ...(body ? { body: form(body) } : {}) });
  const login = await web('/mod/login', { email: 'o@example.com', password: 'correct horse' });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  assert.match(await (await web('/mod', undefined, cookie)).text(), /Enter the code/);
  assert.equal((await web('/mod/errors', undefined, cookie)).status, 403, 'no other /mod page either');
  assert.equal((await web('/mod/feedback', undefined, cookie)).status, 403);
  assert.equal((await web('/mod/code', { code: '12345x' }, cookie)).status, 403);
  assert.equal((await web('/mod/code', { code: t.lastCode!('o@example.com') }, cookie)).status, 303);
  assert.match(await (await web('/mod', undefined, cookie)).text(), /Moderation queue/);
  assert.equal((await web('/mod/errors', undefined, cookie)).status, 200);

  // The Studio by email code: the inbox is already proved, Admin opens at once.
  await t.call('POST', '/v1/auth/code', { email: 'o@example.com' });
  const v = await t.call('POST', '/v1/auth/code/verify', { email: 'o@example.com', code: t.lastCode!('o@example.com'), deviceLabel: 'studio-web' });
  const token = ((await v.json()) as { token: string }).token;
  const s = await t.call('POST', '/v1/studio/session', undefined, token, { 'x-studio': '1' });
  assert.equal((await sCall(t, 'GET', '/v1/admin/audit', { id: o.id, token, cookie: cookieOf(s, 'sm_studio')! })).status, 200);
  await t.close();
});

// ---------------------------------------------------------------- G-SB3 picture metadata (server)

const be16 = (v: number) => [v >> 8, v & 0xff];
/** A small JPEG whose Exif carries a GPS pointer (tag 0x8825) and Orientation 6. */
function gpsJpeg(): Uint8Array {
  const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 2, ...be16(0x0112), 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, ...be16(0x8825), 0, 4, 0, 0, 0, 1, 0, 0, 0, 38, 0, 0, 0, 0];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...be16(app1.length + 2), ...app1, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
}
const hasGpsTag = (b: Uint8Array) => b.some((_, i) => b[i] === 0x88 && b[i + 1] === 0x25);

test('G-SB3: a profile photo with GPS is stored without it (the turn is kept)', async () => {
  const stored: Uint8Array[] = [];
  const avatars: VoiceStorage = { ready: true, put: async (path, bytes) => { stored.push(new Uint8Array(bytes)); return { url: `https://blob.example/${path}`, pathname: path }; }, remove: async () => undefined };
  const t = await freshDb({ avatarStorage: avatars });
  const a = await signUp(t);
  const input = gpsJpeg();
  assert.ok(hasGpsTag(input), 'the test photo has GPS');
  const r = await t.app.request('/v1/me/avatar', { method: 'PUT', body: input as unknown as BodyInit, headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${a.token}` } });
  assert.equal(r.status, 200);
  assert.equal(stored.length, 1);
  assert.ok(!hasGpsTag(stored[0]!), 'no GPS in what was stored');
  assert.deepEqual([...stored[0]!.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe1], 'an orientation-only Exif');
  assert.equal(stored[0]![31], 6, 'Orientation 6 kept');
  await t.close();
});

// ---------------------------------------------------------------- G-SB4 CSV

test('G-SB4: a CSV text cell starting with = + - @ tab or CR is written as text; numbers stay numbers', async () => {
  const csv = toCsv(['T'], [['=1+1'], ['+x'], ['-x'], ['@x'], ['\tx'], ['\rx'], ['ok'], [-4.99]]).slice(1).split('\r\n');
  assert.deepEqual(csv.slice(0, 9), ['T', "'=1+1", "'+x", "'-x", "'@x", "'\tx", '"\'\rx"', 'ok', '-4.99']);
  const t = await freshDb();
  const owner = await studioLogin(t, 'host@example.com', 'Host');
  const feed = 'https://feeds.example.com/sb.xml';
  const key = await proveClaim(t, owner.id, feed);
  await addEpisode(t, feed, 'E1', '=HYPERLINK("https://evil.example","click")', 60_000, noon(1));
  const text = await (await sCall(t, 'GET', `/v1/studio/shows/${key}/export/episodes.csv`, owner)).text();
  assert.ok(text.split('\r\n').some((l) => l.startsWith('"\'=HYPERLINK(""https://evil.example"",""click"")"')), text);
  await t.close();
});

// ---------------------------------------------------------------- data export

test('Download my data: one a day, a 24-hour link to the account\'s own data with no secrets', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const r = await t.call('POST', '/v1/me/export', undefined, a.token);
  assert.equal(r.status, 200);
  assert.equal((await t.call('POST', '/v1/me/export', undefined, a.token)).status, 429, 'one a day');
  const mail = t.mail!.filter((m) => m.to === 'a@example.com').pop()!;
  const link = /https?:\/\/\S+/.exec(mail.text)![0];
  const path = link.slice(link.indexOf('/v1/'));
  const file = await t.call('GET', path);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition') ?? '', /attachment; filename="socialnet-data-/);
  const text = await file.text();
  const data = JSON.parse(text) as { profile: { email: string }; devices: unknown[] };
  assert.equal(data.profile.email, 'a@example.com');
  assert.ok(!/password|token_hash|b@example\.com/.test(text), 'no secrets and nobody else');
  assert.ok(Array.isArray(data.devices));
  // A link for B, signed by someone without the pepper, or expired: refused.
  assert.equal((await t.call('GET', path.replace(a.id, b.id))).status, 404, 'the id is signed');
  assert.equal((await t.call('GET', `/v1/me/export/download?t=${encodeURIComponent(exportLinkToken(a.id, TEST_PEPPER, Date.now() - 25 * 3_600_000))}`)).status, 404, 'expired');
  await t.close();
});

// ---------------------------------------------------------------- test purchases

test('a Google test purchase is refused where test purchases are not allowed, and marked when they are', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const play: GooglePlay = {
    ready: true,
    subscription: async () => ({ state: 'SUBSCRIPTION_STATE_ACTIVE', acknowledged: true, productId: 'plus_monthly', expiresAt: '2099-01-01T00:00:00.000Z', orderId: `GPA.${Math.random()}`, profileId: null, test: true }),
    product: async () => { throw new Error('unused'); },
    acknowledge: async () => undefined,
    voided: async () => [],
  };
  const prod = createApp({ db: t.db, pepper: TEST_PEPPER, play, allowTestPurchases: false });
  const buy = (app: ReturnType<typeof createApp>, token: string) => app.request('/v1/me/purchases/google', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.token}` }, body: JSON.stringify({ productId: 'plus_monthly', purchaseToken: token }) });
  const refused = await buy(prod, 'tok-1');
  assert.equal(refused.status, 402);
  assert.equal(((await refused.json()) as { test?: boolean }).test, true);
  assert.equal((await t.q('SELECT 1 FROM purchases')).length, 0, 'nothing written');
  const dev = createApp({ db: t.db, pepper: TEST_PEPPER, play, allowTestPurchases: true });
  assert.equal((await buy(dev, 'tok-2')).status, 200);
  assert.deepEqual(await t.q('SELECT test FROM purchases'), [{ test: true }]);
  await t.close();
});

// ---------------------------------------------------------------- secret rotation

test('PEPPER_NEXT: during a rotation a token made with the other pepper still works, and is re-keyed on first use', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Al'); // hashed with TEST_PEPPER
  const NEW = 'the-new-pepper-not-secret';
  const swapped = createApp({ db: t.db, pepper: NEW, pepperNext: TEST_PEPPER, mailer: { send: async () => undefined } });
  const me = (app: ReturnType<typeof createApp>) => app.request('/v1/me', { headers: { authorization: `Bearer ${a.token}` } });
  assert.equal((await me(createApp({ db: t.db, pepper: NEW }))).status, 401, 'without PEPPER_NEXT the old hash is not found');
  assert.equal((await me(swapped)).status, 200, 'with it, it is');
  assert.equal((await me(createApp({ db: t.db, pepper: NEW }))).status, 200, 're-keyed: the new pepper alone now finds it');
  assert.equal((await me(createApp({ db: t.db, pepper: TEST_PEPPER }))).status, 401, 'and the old one no longer does');
  await t.close();
});
