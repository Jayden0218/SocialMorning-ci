// The products SocialNet sells through the stores: PLUS, a paid show's price levels, and tips.
/**
 * M20 US6 (spec FR-020–FR-024; research R6). The ids must match the products the owner creates in
 * Play Console (gate G2). A paid show is not a product of its own: it is sold at one of five price
 * levels, and the purchase names its show by `obfuscatedProfileId` = fnv1a64(feed URL) (Google
 * allows 64 characters; a feed URL can be longer). Tips are consumable, one of three sizes.
 */
export const PLUS = 'plus_monthly';
export const SHOW_TIERS = ['show_tier_1', 'show_tier_2', 'show_tier_3', 'show_tier_4', 'show_tier_5'] as const;
export const TIPS = ['tip_small', 'tip_medium', 'tip_large'] as const;

export type ProductKind = 'plus' | 'show' | 'tip';

export function kindOf(productId: string): ProductKind | undefined {
  if (productId === PLUS) return 'plus';
  if ((SHOW_TIERS as readonly string[]).includes(productId)) return 'show';
  if ((TIPS as readonly string[]).includes(productId)) return 'tip';
  return undefined;
}

/** show_tier_3 → 3 */
export const tierOf = (productId: string): number | undefined => {
  const m = /^show_tier_([1-5])$/.exec(productId);
  return m ? Number(m[1]) : undefined;
};
export const tierProduct = (tier: number): string => `show_tier_${tier}`;
