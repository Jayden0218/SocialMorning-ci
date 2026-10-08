// Tests the M24 server fixes (lane F-S): PLUS from codes apart from the store, email change signs out other sessions, pictures on held comments.
/**
 * specs/025-m24-gaps-and-look, "Fixes F-S". Guards:
 *  - G-M24-FS-1 — a store refund keeps redeem-code PLUS days, and code days never stretch a
 *    refunded store subscription. Break: in `redeemCode` (src/db/repos/account/redeem.ts) write
 *    the code days onto the store's row (ref '' instead of PLUS_BY_CODE) → the refund takes them
 *    away and this test goes red.
 *  - G-M24-FS-2 — confirming a new sign-in email signs out every OTHER session and keeps this one.
 *    Break: in src/routes/account/email.ts drop the `DELETE FROM sessions …` line → the other
 *    phone still signs in and `signedOut` is 0.
 * Google itself is NOT VERIFIED here (fake Play).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { proveClaim, sCall, studioLogin } from './studio-harness.ts';
import type { GooglePlay } from '../src/billing/google-play.ts';
import type { ImageStorage } from '../src/storage/image-store.ts';
import { applyVoided } from '../src/db/repos/account/purchases.ts';
import { createCodes } from '../src/db/repos/account/redeem.ts';

const DAY = 86_400_000;
const daysAway = (iso: string | null | undefined) => (Date.parse(iso ?? '') - Date.now()) / DAY;
type Me = { listener: { plus: boolean; plusUntil: string | null; email: string } };
const me = async (t: TestDb, token: string) => (await (await t.call('GET', '/v1/me', undefined, token)).json()) as Me;

function fakePlay(state: { expiresAt: string }) {
  const play: GooglePlay = {
    ready: true,
    subscription: async () => ({ state: 'SUBSCRIPTION_STATE_ACTIVE', acknowledged: true, productId: 'plus_monthly', expiresAt: state.expiresAt, orderId: 'GPA.1', profileId: null, test: true }),
    product: async () => { throw new Error('not used'); },
    acknowledge: async () => {},
    voided: async () => [],
  };
  return play;
}

test('G-M24-FS-1: code PLUS days live apart from the store — a renewal does not touch them, a refund keeps them, and they never stretch the refunded sub', async () => {
  const state = { expiresAt: new Date(Date.now() + 365 * DAY).toISOString() };
  const t = await freshDb({ play: fakePlay(state) });
  const a = await signUp(t);
  const [code] = await createCodes(t.db, { grant: { kind: 'plus', days: 30 }, count: 1, maxUses: 1, note: '', expiresAt: null, createdBy: a.id });

  // A store subscription, then a 30-day code on top of it.
  assert.equal((await t.call('POST', '/v1/me/purchases/google', { productId: 'plus_monthly', purchaseToken: 'tok-plus' }, a.token)).status, 200);
  const r = await t.call('POST', '/v1/me/redeem', { code }, a.token);
  assert.equal(r.status, 200, await r.clone().text());
  const g = (await r.json()) as { grant: { until: string | null } };
  assert.equal(g.grant.until, state.expiresAt, 'PLUS until = the later of the two sources');
  const rows = async () => (await t.q<{ ref: string; until: string }>("SELECT ref, until FROM entitlements WHERE listener_id = $1 AND kind = 'plus' ORDER BY ref", [a.id]))
    .map((e) => [e.ref, Math.round(daysAway(new Date(e.until).toISOString()))]);
  assert.deepEqual(await rows(), [['', 365], ['code', 30]], 'two rows: the store\'s and the code\'s');

  // A renewal from Google rewrites the store row only.
  state.expiresAt = new Date(Date.now() + 400 * DAY).toISOString();
  assert.equal((await t.call('POST', '/v1/me/purchases/google', { productId: 'plus_monthly', purchaseToken: 'tok-plus' }, a.token)).status, 200);
  assert.deepEqual(await rows(), [['', 400], ['code', 30]], 'the renewal left the code days alone');
  assert.equal((await me(t, a.token)).listener.plusUntil, state.expiresAt);

  // The guard: a refund takes the store's PLUS, the code's 30 days stay — and only 30.
  const v = await applyVoided(t.db, [{ purchaseToken: 'tok-plus', voidedAt: Date.now() }]);
  assert.equal(v.withdrawn, 1);
  const after = await me(t, a.token);
  assert.equal(after.listener.plus, true, 'the code days survive the refund');
  const left = daysAway(after.listener.plusUntil);
  assert.ok(left > 29.9 && left < 30.1, `PLUS now ends with the code days (30), got ${left}`);
  assert.equal((await (await t.call('GET', `/v1/listeners/${a.id}`)).json() as { profile: { plus: boolean } }).profile.plus, true);
  await t.close();
});

test('a code alone: PLUS for its days; a second code adds on from the end of the first', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const codes = await createCodes(t.db, { grant: { kind: 'plus', days: 10 }, count: 2, maxUses: 1, note: '', expiresAt: null, createdBy: a.id });
  for (const code of codes) assert.equal((await t.call('POST', '/v1/me/redeem', { code }, a.token)).status, 200);
  const m = await me(t, a.token);
  assert.equal(m.listener.plus, true);
  const left = daysAway(m.listener.plusUntil);
  assert.ok(left > 19.9 && left < 20.1, `20 days, got ${left}`);
  await t.close();
});

test('G-M24-FS-2: a new sign-in email signs out every other session; this one stays; another account is untouched', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const other = await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' });
  const otherToken = ((await other.json()) as { token: string }).token;
  const third = ((await (await t.call('POST', '/v1/auth/sign-in', { email: 'a@example.com', password: 'correct horse' })).json()) as { token: string }).token;
  const b = await signUp(t, 'b@example.com', 'Bo');
  assert.equal((await t.call('GET', '/v1/me', undefined, otherToken)).status, 200);

  assert.equal((await t.call('POST', '/v1/me/email/start', { email: 'new@example.com' }, a.token)).status, 200);
  const ok = await t.call('POST', '/v1/me/email/confirm', { code: t.lastCode!('new@example.com') }, a.token);
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.deepEqual(await ok.json(), { email: 'new@example.com', signedOut: 2 });

  assert.equal((await t.call('GET', '/v1/me', undefined, a.token)).status, 200, 'the session that confirmed stays');
  assert.equal((await t.call('GET', '/v1/me', undefined, otherToken)).status, 401, 'the other phone is signed out');
  assert.equal((await t.call('GET', '/v1/me', undefined, third)).status, 401);
  assert.equal((await t.call('GET', '/v1/me', undefined, b.token)).status, 200, 'another account keeps its session');
  assert.equal((await t.q('SELECT 1 FROM sessions s JOIN listeners l ON l.id = s.listener_id WHERE l.email = $1', ['new@example.com'])).length, 1);
  await t.close();
});

const FEED = 'https://feeds.example.com/held-image.xml';
const EP = fnv1a64(FEED + '\u0001' + 'g1');
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

test('a comment held for review takes a picture from its author; Approve moves it, Reject deletes the file', async () => {
  const puts: string[] = [];
  const removed: string[] = [];
  const store: ImageStorage = {
    ready: true,
    put: async (path) => { puts.push(path); return { url: `https://pub.example/${path}`, pathname: path }; },
    remove: async (path) => { removed.push(path); },
  };
  const t = await freshDb({ imageStorage: store });
  await putEpisode(t, EP, { feedUrl: FEED, guid: 'g1', title: 'Ep 1', enclosureUrl: 'https://cdn/1.mp3', durationMs: 1_000_000 });
  const host = await studioLogin(t, 'o@example.com', 'Host');
  const key = await proveClaim(t, host.id, FEED);
  const mei = await signUp(t, 'mei@example.com', 'Mei');
  const xu = await signUp(t, 'xu@example.com', 'Xu');
  await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, host, { mode: 'review' });
  const add = (id: string, token: string) =>
    t.app.request(`/v1/comments/${id}/image`, { method: 'POST', body: JPEG as unknown as BodyInit, headers: { 'content-type': 'image/jpeg', 'x-width': '640', 'x-height': '480', authorization: `Bearer ${token}` } });
  const hold = async (body: string) => {
    // Past the 5 s floor on both tables (an approved comment counts as just posted).
    await t.q("UPDATE held_comments SET created_at = created_at - interval '10 seconds'");
    await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
    const r = await t.call('POST', `/v1/episodes/${EP}/comments`, { body }, mei.token);
    return ((await r.json()) as { held: boolean; comment: { id: string } }).comment.id;
  };

  const first = await hold('Look at this');
  assert.equal((await add(first, xu.token)).status, 403, 'only the author');
  const r = await add(first, mei.token);
  assert.equal(r.status, 201, await r.clone().text());
  const got = (await r.json()) as { held: boolean; comment: { held?: true; image?: { url: string; w: number } } };
  assert.deepEqual([got.held, got.comment.held, got.comment.image?.w], [true, true, 640]);
  assert.equal((await add(first, mei.token)).status, 409, 'one picture');
  type C = { body: string | null; image?: { url: string } };
  const mine = ((await (await t.call('GET', `/v1/episodes/${EP}/social`, undefined, mei.token)).json()) as { comments: C[] }).comments;
  assert.equal(mine[0]?.image?.url, `https://pub.example/${puts[0]}`, 'the author sees the picture while it waits');

  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/pending/${first}/approve`, host)).status, 200);
  const seen = ((await (await t.call('GET', `/v1/episodes/${EP}/social`, undefined, xu.token)).json()) as { comments: C[] }).comments;
  assert.deepEqual(seen.map((c) => [c.body, c.image?.url]), [['Look at this', `https://pub.example/${puts[0]}`]], 'approved with its picture');
  assert.deepEqual(removed, []);

  const second = await hold('Maybe not');
  assert.equal((await add(second, mei.token)).status, 201);
  assert.equal((await sCall(t, 'POST', `/v1/studio/shows/${key}/comments/pending/${second}/reject`, host)).status, 204);
  assert.deepEqual(removed, [puts[1]], 'rejected: the file left the store');
  await t.close();
});
