// Tests gifts of a paid series with a fake Google: verified, claimed once, refused to an owner, withdrawn on a refund.
/**
 * M22 US14 (FR-042–FR-044; contracts/api.md "Gift"). Guard G-M22-9: a gift is claimable once, and
 * a refund withdraws it. Break: in claimGift (src/db/repos/account/gifts.ts) drop the
 * `if (g.claimed_by !== null)` line and the `AND claimed_by IS NULL` in its UPDATE → the second
 * claim succeeds and this test goes red. Google itself is NOT VERIFIED here (fake).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import type { GooglePlay, GoogleProduct } from '../src/billing/google-play.ts';
import { applyVoided } from '../src/db/repos/account/purchases.ts';
import { GIFT_TIERS, kindOf, tierOf } from '../src/billing/products.ts';

const FEED = 'https://socialmorning-api.vercel.app/feeds/hosted.xml';

function fakePlay(product: Partial<GoogleProduct> = {}): GooglePlay {
  return {
    ready: true,
    subscription: async () => { throw new Error('not used'); },
    product: async () => ({ purchaseState: 0, acknowledged: false, orderId: `GPA.${Math.random()}`, profileId: fnv1a64(FEED), test: true, ...product }),
    acknowledge: async () => {},
    voided: async () => [],
  };
}

test('gift products: gift_tier_1..5, sold at the show\'s own level', () => {
  assert.deepEqual([...GIFT_TIERS], ['gift_tier_1', 'gift_tier_2', 'gift_tier_3', 'gift_tier_4', 'gift_tier_5']);
  assert.deepEqual([kindOf('gift_tier_3'), tierOf('gift_tier_3'), kindOf('show_tier_3'), tierOf('show_tier_3')], ['gift', 3, 'show', 3]);
});

test('G-M22-9: a verified gift makes a link; the first claim wins, a second is refused, an owner is told, a refund withdraws', async () => {
  const t = await freshDb({ play: fakePlay() });
  const owner = await signUp(t, 'owner@example.com', 'Owner');
  await t.q('INSERT INTO hosted_shows (owner_id, feed_url, title, price_tier) VALUES ($1, $2, $3, 2)', [owner.id, FEED, 'Hosted']);
  const a = await signUp(t, 'a@example.com', 'Ana');
  const b = await signUp(t, 'b@example.com', 'Ben');
  const c = await signUp(t, 'c@example.com', 'Cy');

  assert.equal((await t.call('POST', '/v1/me/purchases/google', { productId: 'gift_tier_3', purchaseToken: 'wrong', feedUrl: FEED }, a.token)).status, 422, 'not this show\'s price');
  const buy = await t.call('POST', '/v1/me/purchases/google', { productId: 'gift_tier_2', purchaseToken: 'tok-gift-1', feedUrl: FEED }, a.token);
  assert.equal(buy.status, 200, await buy.clone().text());
  const { purchase, gift } = (await buy.json()) as { purchase: { kind: string }; gift: { code: string; url: string } };
  assert.equal(purchase.kind, 'gift');
  assert.match(gift.code, /^[A-Za-z0-9]{16}$/);
  assert.ok(gift.url.endsWith(`/gift/${gift.code}`));
  assert.equal((await t.q("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show'", [a.id])).length, 0, 'the buyer did not buy it for themself');
  // The same purchase sent again gives the same link, not a second gift.
  const repeat = (await (await t.call('POST', '/v1/me/purchases/google', { productId: 'gift_tier_2', purchaseToken: 'tok-gift-1', feedUrl: FEED }, a.token)).json()) as { gift: { code: string } };
  assert.equal(repeat.gift.code, gift.code);
  assert.equal((await t.q('SELECT 1 FROM gifts')).length, 1);

  const view = (await (await t.call('GET', `/v1/gifts/${gift.code}`)).json()) as { show: { feedUrl: string; title: string }; claimed: boolean; buyerName: string };
  assert.deepEqual([view.show.feedUrl, view.show.title, view.claimed, view.buyerName], [FEED, 'Hosted', false, 'Ana']);
  assert.equal((await t.call('POST', `/v1/gifts/${gift.code}/claim`)).status, 401, 'claiming needs sign-in');

  assert.equal((await t.call('POST', `/v1/gifts/${gift.code}/claim`, undefined, b.token)).status, 204);
  assert.equal((await t.q("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show' AND ref = $2", [b.id, FEED])).length, 1);
  const second = await t.call('POST', `/v1/gifts/${gift.code}/claim`, undefined, c.token);
  assert.equal(second.status, 409);
  assert.equal(((await second.json()) as { error: string }).error, 'already_claimed');
  assert.equal((await t.q("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show'", [c.id])).length, 0);
  const mine = (await (await t.call('GET', '/v1/me/gifts', undefined, a.token)).json()) as { items: { code: string; claimed: boolean }[] };
  assert.deepEqual(mine.items.map((i) => [i.code, i.claimed]), [[gift.code, true]]);

  // A second gift: B already owns the series → told, and the link stays for someone else.
  const g2 = ((await (await t.call('POST', '/v1/me/purchases/google', { productId: 'gift_tier_2', purchaseToken: 'tok-gift-2', feedUrl: FEED }, a.token)).json()) as { gift: { code: string } }).gift;
  const owned = await t.call('POST', `/v1/gifts/${g2.code}/claim`, undefined, b.token);
  assert.equal(owned.status, 409);
  assert.equal(((await owned.json()) as { error: string }).error, 'already_owned');
  assert.equal(((await (await t.call('GET', `/v1/gifts/${g2.code}`)).json()) as { claimed: boolean }).claimed, false);

  // Refunds: the claimed gift is withdrawn from B; the unclaimed one is cancelled (410).
  await applyVoided(t.db, [{ purchaseToken: 'tok-gift-1', voidedAt: Date.now() }, { purchaseToken: 'tok-gift-2', voidedAt: Date.now() }]);
  assert.equal((await t.q("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show'", [b.id])).length, 0, 'withdrawn');
  const late = await t.call('POST', `/v1/gifts/${g2.code}/claim`, undefined, c.token);
  assert.equal(late.status, 410);
  assert.equal(((await late.json()) as { error: string }).error, 'cancelled');
  assert.equal((await t.call('GET', '/v1/gifts/AAAAAAAAAAAAAAAA')).status, 404);
  const page = await t.app.request(`/gift/${g2.code}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /refunded/);
  await t.close();
});
