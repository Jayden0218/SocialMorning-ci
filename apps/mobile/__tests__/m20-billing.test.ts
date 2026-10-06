// Tests the purchase rules on the phone: who can buy, which purchases are used up, the store request.
/**
 * M20 US6 (spec FR-020–FR-025). Logic only — no purchase has run (no Play account; NOT VERIFIED).
 */
import { canBuy, consumable, kindOf, PLUS, purchaseRequest } from '@/billing/products';

it('only Android with the store module, the server connected, and not teen mode can buy', () => {
  expect(canBuy({ platform: 'android', native: true, serverReady: true, teen: false })).toBe(true);
  expect(canBuy({ platform: 'ios', native: true, serverReady: true, teen: false })).toBe(false);
  expect(canBuy({ platform: 'android', native: false, serverReady: true, teen: false })).toBe(false);
  expect(canBuy({ platform: 'android', native: true, serverReady: false, teen: false })).toBe(false);
  expect(canBuy({ platform: 'android', native: true, serverReady: true, teen: true })).toBe(false);
});

it('tips are used up (buyable again); PLUS and shows are kept', () => {
  expect([consumable('tip_small'), consumable(PLUS), consumable('show_tier_2')]).toEqual([true, false, false]);
  expect([kindOf('tip_large'), kindOf('show_tier_5'), kindOf(PLUS), kindOf('show_tier_6')]).toEqual(['tip', 'show', 'plus', undefined]);
});

it('PLUS asks for its subscription offer; a show names itself by its hash', () => {
  expect(purchaseRequest(PLUS, { offerToken: 'ot' })).toEqual({ type: 'subs', request: { google: { skus: [PLUS], subscriptionOffers: [{ sku: PLUS, offerToken: 'ot' }] } } });
  expect(() => purchaseRequest(PLUS, {})).toThrow(/offer/);
  expect(purchaseRequest('show_tier_2', { profileId: 'abc123' })).toEqual({ type: 'in-app', request: { google: { skus: ['show_tier_2'], obfuscatedProfileId: 'abc123' } } });
});
