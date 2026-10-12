// Grants what a store purchase bought, once, and takes it back when the store reports a refund.
/**
 * M20 US6 (spec FR-020–FR-026; data-model "purchases"; guard G-M20-5). A Google Play purchase is
 * checked with Google first (`GooglePlay`), then written once — `purchase_token` is unique, so a
 * repeated or raced notice finds the same row and grants nothing new. What it grants:
 *  - PLUS → `entitlements (plus, '', until = Google's expiry)`; sending the token again refreshes the expiry.
 *    Fix F-S: that row is the store's alone — redeem codes and Admin keep their own rows (`plusUntil`)
 *  - a show's price level → `entitlements (show, feed URL)`: every paid episode of that show
 *  - a tip → a `tips` row to the show
 *  - M22 US14: a gift of a show (`gift_tier_n`) → nothing for the buyer; a `gifts` row with a code
 * The purchase is acknowledged with Google after the grant (Google refunds an unacknowledged one
 * after 3 days); if that fails, `acknowledgeDue` retries it from the internal cycle. A refund
 * (`applyVoided`) marks the row refunded and deletes what it granted; one for a purchase this
 * server never saw is only logged.
 */
import { fnv1a64 } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';
import { ApiError } from '../../../errors.ts';

export type GrantIn = { listenerId: string; productId: string; purchaseToken: string; feedUrl?: string;
  /** M25 SB: a Google test purchase (licence tester) is granted only when this is true; it is then stored with `test = true`. */
  allowTest?: boolean };

/** M25 SB (audit #29): a test purchase in production is refused before anything is written. */
export function checkTest(test: boolean, allow: boolean | undefined): boolean {
  if (test && !allow) throw new ApiError('not_paid', 'Test purchases are not accepted here.', { test: true });
  return test;
}
export type Granted = { purchaseId: string; kind: 'plus' | 'show' | 'gift' | 'tip'; status: 'active' | 'expired' | 'refunded'; expiresAt: string | null; repeated: boolean; /** M22 US14: the gift's code */ giftCode?: string };

/**
 * M23 US4 (FR-008): the phone sets Google's `obfuscatedAccountId` to this hash of the buyer's
 * listener id (apps/mobile/src/billing/play.ts — keep the two in step). Google gives it back as
 * `obfuscatedExternalAccountId`; a purchase carrying another account's hash is refused. A
 * purchase without one (made before M23) stays valid for whoever first sent it.
 */
export function accountHashOf(listenerId: string): string {
  return fnv1a64(`account|${listenerId}`);
}

/** Refuses a purchase that names another account; returns the hash to store (null when absent). */
export function checkAccount(given: string | null | undefined, listenerId: string, stored?: string | null): string | null {
  const mine = accountHashOf(listenerId);
  if (given && given !== mine) throw new ApiError('conflict', 'This purchase belongs to another account.');
  if (stored && stored !== mine) throw new ApiError('conflict', 'This purchase belongs to another account.');
  return given ?? null;
}

export const ACTIVE_STATES: ReadonlySet<string> = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

export const grantGoogle = viaStore<typeof import('./paid-ddb/purchases.ts').grantGoogle>('pd/purchases', 'grantGoogle');

/**
 * Refunds from Google: the row is marked, and what it granted is taken back.
 * M23 US4 (FR-007, G-M23-5): each refund is ONE transaction. If any step fails, nothing of it
 * is recorded — the purchase stays un-voided and keeps what it granted — so the next run
 * finds it again and retries the whole refund. One failed refund does not stop the others.
 */
export const applyVoided = viaStore<typeof import('./paid-ddb/purchases.ts').applyVoided>('pd/purchases', 'applyVoided');

/** Purchases not yet acknowledged (the first try failed): try again, oldest first. */
export const acknowledgeDue = viaStore<typeof import('./paid-ddb/purchases.ts').acknowledgeDue>('pd/purchases', 'acknowledgeDue');

/**
 * Fix F-S: PLUS comes from separate rows, one per source (`entitlements.ref`): '' = the store
 * (Google Play; renewals and refunds touch only it), 'code:<CODE>' = one redeem code each (legacy
 * 'code' = codes redeemed before migration 026), 'admin' = given by hand (routes/admin/users.ts
 * PLUS_BY_ADMIN). No source ever writes another's row.
 *
 * Each row is an interval [starts_at, until): `starts_at` NULL = already started, `until` NULL =
 * for ever. A code's interval starts at the latest end over all sources when it is redeemed (or
 * now), so a code redeemed during a running store sub adds its days AFTER it. A store refund
 * deletes only the store row: the code keeps its own N days (there may be a gap before it starts).
 */
export const PLUS_BY_STORE = '';
export const PLUS_BY_CODE = 'code';
export const codeRef = (code: string): string => `${PLUS_BY_CODE}:${code}`;

export type PlusInterval = { start: number | null; end: number | null };

/**
 * Pure. Active = now falls inside ANY interval. `until` = the end of the continuous run that
 * contains now: from the intervals holding now, follow every interval that touches or overlaps
 * the run's end. `until` null with `active` = for ever; inactive → null.
 */
export function plusRun(intervals: readonly PlusInterval[], now: number): { active: boolean; until: number | null } {
  const holds = (i: PlusInterval, t: number) => (i.start === null || i.start <= t) && (i.end === null || i.end > t);
  const live = intervals.filter((i) => holds(i, now));
  if (live.length === 0) return { active: false, until: null };
  if (live.some((i) => i.end === null)) return { active: true, until: null };
  let end = Math.max(...live.map((i) => i.end!));
  for (let moved = true; moved;) {
    moved = false;
    for (const i of intervals) {
      if ((i.start === null || i.start <= end) && (i.end === null || i.end > end)) {
        if (i.end === null) return { active: true, until: null };
        end = i.end;
        moved = true;
      }
    }
  }
  return { active: true, until: end };
}

/**
 * Fix F-S (head, 2026-10-08): after a store or admin PLUS row changes, codes that have NOT started
 * yet are pushed later so they still follow on without overlap, each keeping its N days. Started
 * codes are never moved, and nothing moves earlier (a refund may leave a gap; that is accepted).
 * Call it in the same transaction as the change: the store sync (`grantGoogle`) and Admin's grant.
 */
export const rechainCodes = viaStore<typeof import('./paid-ddb/purchases.ts').rechainCodes>('pd/purchases', 'rechainCodes');

/** PLUS now, and when its continuous run ends (`plusRun`). Computed, never stored. */
export const plusUntil = viaStore<typeof import('./paid-ddb/purchases.ts').plusUntil>('pd/purchases', 'plusUntil');

/** Whether this listener has PLUS now (the badge, the icons): any source whose interval holds now. */
export const hasPlus = viaStore<typeof import('./paid-ddb/purchases.ts').hasPlus>('pd/purchases', 'hasPlus');

// M26: the wallet page's reads and the sweep's refund-check cache (moved here from routes/).

export type PurchaseListRow = { id: string; store: string; product_id: string; status: string; expires_at: Date | string | null; amount_micros: string | number | null; currency: string | null; created_at: Date | string };
export type EntitlementListRow = { kind: string; ref: string; starts_at: Date | string | null; until: Date | string | null };
export type TipListRow = { id: string; to_feed_url: string; created_at: Date | string; amount_micros: string | number | null; currency: string | null; show_title: string | null };

/** My purchases, newest first (at most 200). */
export const listPurchaseRows = viaStore<typeof import('./paid-ddb/purchases.ts').listPurchaseRows>('pd/purchases', 'listPurchaseRows');

/** My entitlements. */
export const listEntitlementRows = viaStore<typeof import('./paid-ddb/purchases.ts').listEntitlementRows>('pd/purchases', 'listEntitlementRows');

/** The tips I gave, newest first (at most 200), with the show's title. */
export const listTipRows = viaStore<typeof import('./paid-ddb/purchases.ts').listTipRows>('pd/purchases', 'listTipRows');

/** When Google's refunds were last read (the `billing:voided` cache row). */
export const lastVoidedCheckRows = viaStore<typeof import('./paid-ddb/purchases.ts').lastVoidedCheckRows>('pd/purchases', 'lastVoidedCheckRows');

/** Remember the last refund read and when it happened. */
export const saveVoidedCheck = viaStore<typeof import('./paid-ddb/purchases.ts').saveVoidedCheck>('pd/purchases', 'saveVoidedCheck');

// M26 lane PD: the admin user page's money reads and PLUS writes (moved here from db/repos/admin/admin-users.ts, which
// re-exports them)..

export type MoneyRow = { id: string; product_id: string; store: string; status: string; amount_micros: string | number | null; currency: string | null; created_at: Date | string; expires_at: Date | string | null };
export type TipAdminRow = { id: string; to_feed_url: string; created_at: Date | string; status: string };
export type GiftAdminRow = { id: string; feed_url: string; bought: boolean; claimed_at: Date | string | null; cancelled_at: Date | string | null; created_at: Date | string };

export const plusEntitlements = viaStore<typeof import('./paid-ddb/purchases.ts').plusEntitlements>('pd/purchases', 'plusEntitlements');

export const purchasesOf = viaStore<typeof import('./paid-ddb/purchases.ts').purchasesOf>('pd/purchases', 'purchasesOf');

export const tipsSentBy = viaStore<typeof import('./paid-ddb/purchases.ts').tipsSentBy>('pd/purchases', 'tipsSentBy');

export const giftsOf = viaStore<typeof import('./paid-ddb/purchases.ts').giftsOf>('pd/purchases', 'giftsOf');

/** PLUS for `days` from now under `ref` (the admin's grant), no purchase. */
export const grantPlusByAdmin = viaStore<typeof import('./paid-ddb/purchases.ts').grantPlusByAdmin>('pd/purchases', 'grantPlusByAdmin');

/** Every PLUS row goes, bought or given. */
export const revokeAllPlus = viaStore<typeof import('./paid-ddb/purchases.ts').revokeAllPlus>('pd/purchases', 'revokeAllPlus');

/**
 * AC-T07 (PLUS half): who may get the weekly digest now — every listener whose PLUS holds now. Only the zones
 * where it is Monday noon are read (`Q#plus#<tz>`).
 */
export const plusMembersDue = viaStore<typeof import('./paid-ddb/purchases.ts').plusMembersDue>('pd/purchases', 'plusMembersDue');

/** "Download my data": the four money sections as their rows (data-export.ts SECTIONS). */
export const exportPaidRows = viaStore<typeof import('./paid-ddb/purchases.ts').exportPaidRows>('pd/purchases', 'exportPaidRows');
