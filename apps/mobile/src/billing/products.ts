// The products the app sells and the rules for each: which are subscriptions, which can be bought again.
/**
 * M20 US6 (spec FR-020–FR-025; research R6). Pure — the same ids as apps/api/src/billing/products.ts
 * and Play Console (gate G2). PLUS is a subscription; a paid show is one of five price levels (the
 * purchase names its show by `obfuscatedProfileId`, which the server gives as `profileId`); a tip is
 * consumable — it is "used up" when finished, so it can be bought again.
 */
export const PLUS = 'plus_monthly';
export const SHOW_TIERS = ['show_tier_1', 'show_tier_2', 'show_tier_3', 'show_tier_4', 'show_tier_5'] as const;
export const TIPS = ['tip_small', 'tip_medium', 'tip_large'] as const;
export const TIP_LABELS: Record<(typeof TIPS)[number], string> = { tip_small: 'Small tip', tip_medium: 'Tip', tip_large: 'Big tip' };
/** M22 US14: a paid show bought for someone else, at the show's own price level; consumable (a second gift can be bought). */
export const GIFT_TIERS = ['gift_tier_1', 'gift_tier_2', 'gift_tier_3', 'gift_tier_4', 'gift_tier_5'] as const;

export type ProductKind = 'plus' | 'show' | 'gift' | 'tip';

export function kindOf(productId: string): ProductKind | undefined {
  if (productId === PLUS) return 'plus';
  if ((SHOW_TIERS as readonly string[]).includes(productId)) return 'show';
  if ((GIFT_TIERS as readonly string[]).includes(productId)) return 'gift';
  if ((TIPS as readonly string[]).includes(productId)) return 'tip';
  return undefined;
}

/** M22 US14: show_tier_3 → gift_tier_3 (the gift costs what the show costs); anything else → undefined. */
export function giftProductFor(showProductId: string): string | undefined {
  const m = /^show_tier_([1-5])$/.exec(showProductId);
  return m ? `gift_tier_${m[1]}` : undefined;
}

/** Finished as consumed (buyable again): tips and (M22) gifts. PLUS and shows stay owned. */
export const consumable = (productId: string): boolean => kindOf(productId) === 'tip' || kindOf(productId) === 'gift';

/**
 * The request expo-iap 5.8 takes (types read from its build/types.d.ts): a subscription names its
 * offer token; a one-time product names its show in `obfuscatedProfileId`.
 */
export function purchaseRequest(productId: string, o: { offerToken?: string; profileId?: string }):
  | { type: 'subs'; request: { google: { skus: string[]; subscriptionOffers: { sku: string; offerToken: string }[] } } }
  | { type: 'in-app'; request: { google: { skus: string[]; obfuscatedProfileId?: string } } } {
  if (kindOf(productId) === 'plus') {
    if (!o.offerToken) throw new Error('PLUS has no offer in the store.');
    return { type: 'subs', request: { google: { skus: [productId], subscriptionOffers: [{ sku: productId, offerToken: o.offerToken }] } } };
  }
  return { type: 'in-app', request: { google: { skus: [productId], ...(o.profileId ? { obfuscatedProfileId: o.profileId } : {}) } } };
}

/**
 * Purchases can be made here: an Android phone, a build with the store module, and the server connected to Google.
 * Lane DP: never in the dev app (`variant: 'dev'`, app.config.js) — it shows Wallet's "not available" state,
 * so no real money moves from a test build.
 */
export const canBuy = (o: { platform: string; native: boolean; serverReady: boolean; teen: boolean; variant?: 'dev' | 'prod' }): boolean =>
  o.platform === 'android' && o.native && o.serverReady && !o.teen && o.variant !== 'dev';
