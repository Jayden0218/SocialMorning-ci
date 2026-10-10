// Tests Google Play purchases with a fake Google: grants once, refunds take back, paid episodes stay locked.
/**
 * M20 US6 (spec FR-020–FR-026; contracts/api.md "Purchases"). Guards:
 * - G-M20-5: the same purchase token sent twice grants once; a refund removes what it granted.
 *   Break: in src/db/repos/account/purchases.ts drop the `if (seen && kind !== 'plus') return …`
 *   line and the `ON CONFLICT (purchase_token) DO NOTHING` — a repeat then makes a second tip.
 * - G-M20-6: an episode that existed before M20, or a live one, cannot be made paid.
 *   Break: drop the `created_at === null` check in setEpisodePaid.
 * Google itself is NOT VERIFIED here (fake); the owner has no Play account yet (2026-10-06).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { purchaseRows, tipCount } from './pd-neutral.ts';
import { serviceAccountJwt, type GooglePlay, type GoogleProduct, type GoogleSubscription } from '../src/billing/google-play.ts';
import { applyVoided } from '../src/db/repos/account/purchases.ts';
import { hostedById, setEpisodePaid } from '../src/db/repos/studio/hosted.ts';

function fakePlay(o: { sub?: Partial<GoogleSubscription>; product?: Partial<GoogleProduct> } = {}) {
  const acks: string[] = [];
  const play: GooglePlay = {
    ready: true,
    subscription: async () => ({ state: 'SUBSCRIPTION_STATE_ACTIVE', acknowledged: false, productId: 'plus_monthly', expiresAt: '2099-01-01T00:00:00.000Z', orderId: 'GPA.1', profileId: null, test: true, ...o.sub }),
    product: async () => ({ purchaseState: 0, acknowledged: false, orderId: `GPA.${Math.random()}`, profileId: null, test: true, ...o.product }),
    acknowledge: async (_k, _p, token) => { acks.push(token); },
    voided: async () => [],
  };
  return { play, acks };
}

const FEED = 'https://socialmorning-api.vercel.app/feeds/hosted.xml';

async function withShow(t: TestDb, tier: number | null) {
  const owner = await signUp(t, 'owner@example.com', 'Owner');
  const [s] = await t.q<{ id: string }>('INSERT INTO hosted_shows (owner_id, feed_url, title, price_tier) VALUES ($1, $2, $3, $4) RETURNING id', [owner.id, FEED, 'Hosted', tier]);
  const ep = async (o: { paid?: boolean; old?: boolean; status?: 'draft' | 'published'; at?: string }) => {
    const [e] = await t.q<{ id: string }>(
      `INSERT INTO hosted_episodes (show_id, guid, episode_id, title, audio_url, audio_bytes, audio_type, status, published_at, paid, created_at)
       VALUES ($1, gen_random_uuid()::text, gen_random_uuid()::text, 'Ep', 'https://blob.example/a.mp3', 10, 'audio/mpeg', $2, $3, $4, $5) RETURNING id`,
      [s!.id, o.status ?? 'published', o.at ?? new Date(Date.now() - 60_000).toISOString(), o.paid ?? false, o.old ? null : new Date().toISOString()]);
    return e!.id;
  };
  return { showId: s!.id, ep };
}

test('the service-account JWT is RS256 over header.claims, for the androidpublisher scope', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = serviceAccountJwt({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }, 1_800_000_000);
  const [h, c, sig] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c!, 'base64url').toString());
  assert.deepEqual(claims, { iss: 'sa@x.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600 });
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, Buffer.from(sig!, 'base64url')));
});

test('no Play account yet → 503 and the wallet says not ready', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  assert.equal((await t.call('POST', '/v1/me/purchases/google', { productId: 'plus_monthly', purchaseToken: 'x' }, a.token)).status, 503);
  const w = (await (await t.call('GET', '/v1/me/purchases', undefined, a.token)).json()) as { storeReady: boolean; stores: { google: boolean; apple: boolean } };
  assert.deepEqual([w.storeReady, w.stores], [false, { google: false, apple: false }]);
  await t.close();
});

test('PLUS: checked with Google, granted until its expiry, acknowledged; the badge shows on /me and the profile', async () => {
  const f = fakePlay();
  const t = await freshDb({ play: f.play });
  const a = await signUp(t);
  const r = await t.call('POST', '/v1/me/purchases/google', { productId: 'plus_monthly', purchaseToken: 'tok-plus' }, a.token);
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual(f.acks, ['tok-plus']);
  const me = (await (await t.call('GET', '/v1/me', undefined, a.token)).json()) as { listener: { plus: boolean } };
  assert.equal(me.listener.plus, true);
  const prof = (await (await t.call('GET', `/v1/listeners/${a.id}`)).json()) as { profile: { plus: boolean } };
  assert.equal(prof.profile.plus, true);
  await t.close();
});

test('not paid at Google (pending) → 402, nothing granted', async () => {
  const f = fakePlay({ product: { purchaseState: 2 } });
  const t = await freshDb({ play: f.play });
  const a = await signUp(t);
  await withShow(t, 2);
  const r = await t.call('POST', '/v1/me/purchases/google', { productId: 'show_tier_2', purchaseToken: 'p', feedUrl: FEED }, a.token);
  assert.equal(r.status, 402);
  assert.equal((await purchaseRows(t)).length, 0);
  await t.close();
});

test('G-M20-5: a tip sent twice tips once; a refund takes it back', async () => {
  const f = fakePlay({ product: { profileId: fnv1a64(FEED) } });
  const t = await freshDb({ play: f.play });
  const a = await signUp(t);
  await t.q('INSERT INTO show_overrides (feed_url, tips_enabled) VALUES ($1, true)', [FEED]);
  const tip = () => t.call('POST', '/v1/me/purchases/google', { productId: 'tip_small', purchaseToken: 'tok-tip', feedUrl: FEED }, a.token);
  assert.equal((await tip()).status, 200);
  const again = (await (await tip()).json()) as { purchase: { repeated: boolean } };
  assert.equal(again.purchase.repeated, true);
  assert.equal(await tipCount(t), 1, 'one tip, not two');
  assert.equal((await purchaseRows(t)).length, 1);
  const v = await applyVoided(t.db, [{ purchaseToken: 'tok-tip', voidedAt: Date.now() }, { purchaseToken: 'never-seen', voidedAt: Date.now() }]);
  assert.deepEqual(v, { withdrawn: 1, unknown: 1 });
  assert.equal(await tipCount(t), 0);
  const [p] = await purchaseRows(t);
  assert.equal(p!.status, 'refunded');
  await t.close();
});

test('a paid show: right price level and show or refused; then its paid episodes play through a signed link, and a refund locks them again', async () => {
  const f = fakePlay({ product: { profileId: fnv1a64(FEED) } });
  const t = await freshDb({ play: f.play });
  const a = await signUp(t);
  const { ep } = await withShow(t, 2);
  const paidId = await ep({ paid: true });
  const list0 = (await (await t.call('GET', `/v1/hosted/paid?feedUrl=${encodeURIComponent(FEED)}`, undefined, a.token)).json()) as { forSale: boolean; productId: string; profileId: string; bought: boolean; items: { id: string }[] };
  assert.deepEqual([list0.forSale, list0.productId, list0.profileId, list0.bought, list0.items.map((i) => i.id)], [true, 'show_tier_2', fnv1a64(FEED), false, [paidId]]);
  assert.equal((await t.call('GET', `/v1/hosted/episodes/${paidId}/access`, undefined, a.token)).status, 402);
  assert.equal((await t.call('POST', '/v1/me/purchases/google', { productId: 'show_tier_3', purchaseToken: 'x1', feedUrl: FEED }, a.token)).status, 422, 'wrong price level');
  assert.equal((await t.call('POST', '/v1/me/purchases/google', { productId: 'show_tier_2', purchaseToken: 'x2', feedUrl: 'https://other.example/feed.xml' }, a.token)).status, 422, 'wrong show');
  assert.equal((await t.call('POST', '/v1/me/purchases/google', { productId: 'show_tier_2', purchaseToken: 'tok-show', feedUrl: FEED }, a.token)).status, 200);
  const access = (await (await t.call('GET', `/v1/hosted/episodes/${paidId}/access`, undefined, a.token)).json()) as { url: string };
  const path = new URL(access.url).pathname + new URL(access.url).search;
  const audio = await t.app.request(path);
  assert.equal(audio.status, 302);
  assert.equal(audio.headers.get('location'), 'https://blob.example/a.mp3');
  assert.equal((await t.app.request(path.replace(/sig=[0-9a-f]+/, 'sig=' + '0'.repeat(64)))).status, 402);
  await applyVoided(t.db, [{ purchaseToken: 'tok-show', voidedAt: Date.now() }]);
  assert.equal((await t.call('GET', `/v1/hosted/episodes/${paidId}/access`, undefined, a.token)).status, 402);
  await t.close();
});

test('G-M20-6: an episode from before M20, or a live one, cannot be made paid; the public feed leaves paid episodes out', async () => {
  const t = await freshDb();
  const { showId, ep } = await withShow(t, 1);
  const show = (await hostedById(t.db, showId))!;
  const old = await ep({ old: true, status: 'draft' });
  await assert.rejects(setEpisodePaid(t.db, show, old, true), /stay free/);
  const live = await ep({ status: 'published' });
  await assert.rejects(setEpisodePaid(t.db, show, live, true), /stays free/);
  const draft = await ep({ status: 'draft' });
  assert.equal((await setEpisodePaid(t.db, show, draft, true)).paid, true);
  await t.q("UPDATE hosted_episodes SET status = 'published', published_at = now() - interval '1 minute' WHERE id = $1", [draft]);
  const xml = await (await t.app.request(`/feeds/${showId}.xml`)).text();
  assert.equal((xml.match(/<item>/g) ?? []).length, 1, 'only the free live episode is in the feed');
  const [row] = await t.q('SELECT 1 FROM episodes e JOIN hosted_episodes h ON h.episode_id = e.id WHERE h.id = $1', [draft]);
  assert.equal(row, undefined, 'a paid episode never enters the app\'s episode table');
  await t.close();
});
