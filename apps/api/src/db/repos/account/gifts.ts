// Gifts of a paid show: a code made after the store purchase is verified, claimed once, withdrawn on a refund.
/**
 * M22 US14 (FR-042–FR-044; research R12; guard G-M22-9). A gift is a `gift_tier_n` Google Play
 * purchase, verified exactly like `show_tier_n` (`grantGoogle`), that grants the BUYER nothing:
 * it makes a `gifts` row with a random 16-character code. The first signed-in listener who claims
 * the code gets an `entitlements (show, feed URL)` row whose `source_purchase_id` is the gift's
 * purchase — so a refund (`applyVoided`) deletes that entitlement (withdrawn) and also marks an
 * unclaimed gift cancelled. Claiming is one guarded write: a second claim finds `claimed_by` set.
 */
import { randomBytes } from 'node:crypto';
import { viaStore } from '../../backend.ts';

/** No 0/O, 1/I/L: a code read aloud or typed from a screenshot. 32 symbols × 16 = 80 bits. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789a';
export const GIFT_CODE_LENGTH = 16;

export function newGiftCode(): string {
  const bytes = randomBytes(GIFT_CODE_LENGTH);
  let out = '';
  for (const b of bytes) out += ALPHABET.charAt(b & 31);
  return out;
}

export const giftUrl = (publicBase: string, code: string): string => `${publicBase.replace(/\/$/, '')}/gift/${code}`;

/** GET /v1/gifts/:code — what the link offers. Unknown code → 404. */
export const giftByCode = viaStore<typeof import('./paid-ddb/gifts.ts').giftByCode>('pd/gifts', 'giftByCode');

/** POST /v1/gifts/:code/claim — once (409 already_claimed), not to an owner (409 already_owned), not after a refund (410). */
export const claimGift = viaStore<typeof import('./paid-ddb/gifts.ts').claimGift>('pd/gifts', 'claimGift');

/** GET /v1/me/gifts — the buyer's gifts, newest first, with whether each was claimed (never by whom). */
export const myGifts = viaStore<typeof import('./paid-ddb/gifts.ts').myGifts>('pd/gifts', 'myGifts');
