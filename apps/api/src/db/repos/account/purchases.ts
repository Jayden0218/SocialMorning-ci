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
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import type { GooglePlay } from '../../../billing/google-play.ts';
import { kindOf, tierOf } from '../../../billing/products.ts';
import { cancelGiftsFor, createGift, giftForPurchase } from './gifts.ts';

export type GrantIn = { listenerId: string; productId: string; purchaseToken: string; feedUrl?: string;
  /** M25 SB: a Google test purchase (licence tester) is granted only when this is true; it is then stored with `test = true`. */
  allowTest?: boolean };

/** M25 SB (audit #29): a test purchase in production is refused before anything is written. */
function checkTest(test: boolean, allow: boolean | undefined): boolean {
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

const ACTIVE = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

export async function grantGoogle(db: Db, play: GooglePlay, p: GrantIn): Promise<Granted> {
  const kind = kindOf(p.productId);
  if (!kind) throw new ApiError('validation', 'No such product.', { fields: ['productId'] });
  const [seen] = await db.query<{ id: string; listener_id: string; status: 'active' | 'expired' | 'refunded'; expires_at: Date | string | null; account_hash: string | null }>(
    'SELECT id, listener_id, status, expires_at, account_hash FROM purchases WHERE purchase_token = $1', [p.purchaseToken]);
  if (seen && seen.listener_id !== p.listenerId) throw new ApiError('conflict', 'This purchase belongs to another account.');
  if (seen) checkAccount(undefined, p.listenerId, seen.account_hash);
  if (seen && kind !== 'plus') {
    const giftCode = kind === 'gift' ? await giftForPurchase(db, seen.id) : undefined;
    return { purchaseId: seen.id, kind, status: seen.status, expiresAt: seen.expires_at ? new Date(seen.expires_at).toISOString() : null, repeated: true, ...(giftCode ? { giftCode } : {}) };
  }

  let expiresAt: string | null = null;
  let orderId: string | null = null;
  let acknowledged = false;
  let feedUrl: string | null = null;
  let accountHash: string | null = null;
  let test = false;
  if (kind === 'plus') {
    const s = await play.subscription(p.purchaseToken);
    if (s.productId !== p.productId) throw new ApiError('validation', 'That purchase is for another product.', { fields: ['productId'] });
    test = checkTest(s.test, p.allowTest);
    accountHash = checkAccount(s.accountId, p.listenerId);
    if (!ACTIVE.has(s.state)) {
      if (seen) await db.query("UPDATE purchases SET status = 'expired' WHERE id = $1 AND status = 'active'", [seen.id]);
      throw new ApiError('not_paid', 'Google has not taken this payment.');
    }
    expiresAt = s.expiresAt; orderId = s.orderId; acknowledged = s.acknowledged;
  } else {
    if (!p.feedUrl) throw new ApiError('validation', 'Say which show.', { fields: ['feedUrl'] });
    const g = await play.product(p.productId, p.purchaseToken);
    if (g.purchaseState !== 0) throw new ApiError('not_paid', 'Google has not taken this payment.');
    test = checkTest(g.test, p.allowTest);
    accountHash = checkAccount(g.accountId, p.listenerId);
    // The purchase names its show by a hash of the feed URL; a different show is refused.
    if (g.profileId !== fnv1a64(p.feedUrl)) throw new ApiError('validation', 'That purchase is for another show.', { fields: ['feedUrl'] });
    if (kind === 'show' || kind === 'gift') {
      const [show] = await db.query<{ price_tier: number | null }>('SELECT price_tier FROM hosted_shows WHERE feed_url = $1 AND deleted_at IS NULL', [p.feedUrl]);
      if (!show || show.price_tier === null) throw new ApiError('validation', 'This show sells nothing.', { fields: ['feedUrl'] });
      if (show.price_tier !== tierOf(p.productId)) throw new ApiError('validation', 'That is not this show\'s price.', { fields: ['productId'] });
    } else {
      const [o] = await db.query<{ tips_enabled: boolean | null }>('SELECT tips_enabled FROM show_overrides WHERE feed_url = $1', [p.feedUrl]);
      if (!o?.tips_enabled) throw new ApiError('validation', 'This show does not take tips.', { fields: ['feedUrl'] });
    }
    feedUrl = p.feedUrl; orderId = g.orderId; acknowledged = g.acknowledged;
  }

  const purchaseId = await db.transaction(async (tx) => {
    let id = seen?.id;
    if (id) {
      await tx.query("UPDATE purchases SET status = 'active', expires_at = $2, account_hash = COALESCE(account_hash, $3) WHERE id = $1", [id, expiresAt, accountHash]);
    } else {
      const [row] = await tx.query<{ id: string }>(
        `INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, expires_at, purchase_token, ref, account_hash, test)
         VALUES ($1, 'google', $2, $3, 'active', $4, $5, $6, $7, $8) ON CONFLICT (purchase_token) DO NOTHING RETURNING id`,
        [p.listenerId, p.productId, orderId ?? p.purchaseToken, expiresAt, p.purchaseToken, feedUrl, accountHash, test]);
      if (!row) {
        // A second notice raced this one past the first look: it granted; grant nothing here.
        const [again] = await tx.query<{ id: string }>('SELECT id FROM purchases WHERE purchase_token = $1', [p.purchaseToken]);
        return { id: again!.id, raced: true as boolean };
      }
      id = row.id;
    }
    if (kind === 'plus') {
      await tx.query(`INSERT INTO entitlements (listener_id, kind, ref, until, source_purchase_id) VALUES ($1, 'plus', '', $2, $3)
                      ON CONFLICT (listener_id, kind, ref) DO UPDATE SET until = EXCLUDED.until, source_purchase_id = EXCLUDED.source_purchase_id`, [p.listenerId, expiresAt, id]);
      // Fix F-S: a renewal past a waiting code's start pushes the code later (it keeps its days).
      await rechainCodes(tx, p.listenerId);
    } else if (kind === 'show') {
      await tx.query(`INSERT INTO entitlements (listener_id, kind, ref, until, source_purchase_id) VALUES ($1, 'show', $2, NULL, $3)
                      ON CONFLICT (listener_id, kind, ref) DO NOTHING`, [p.listenerId, feedUrl, id]);
    } else if (kind === 'gift') {
      // M22 US14: the buyer gets a code, not the show (FR-042).
      return { id, raced: false, giftCode: await createGift(tx, { buyerId: p.listenerId, feedUrl: feedUrl!, purchaseId: id }) };
    } else {
      await tx.query('INSERT INTO tips (from_listener, to_feed_url, purchase_id) VALUES ($1, $2, $3)', [p.listenerId, feedUrl, id]);
    }
    return { id, raced: false };
  });

  if (!acknowledged && !purchaseId.raced) {
    try {
      await play.acknowledge(kind === 'plus' ? 'subscription' : 'product', p.productId, p.purchaseToken);
      await db.query('UPDATE purchases SET acknowledged_at = now() WHERE id = $1', [purchaseId.id]);
    } catch (e) {
      console.error('google acknowledge failed; the cycle retries', e instanceof Error ? e.message : String(e));
    }
  } else if (acknowledged) {
    await db.query('UPDATE purchases SET acknowledged_at = coalesce(acknowledged_at, now()) WHERE id = $1', [purchaseId.id]);
  }
  const giftCode = kind === 'gift' ? ('giftCode' in purchaseId && purchaseId.giftCode ? purchaseId.giftCode : await giftForPurchase(db, purchaseId.id)) : undefined;
  return { purchaseId: purchaseId.id, kind, status: 'active', expiresAt, repeated: Boolean(seen) || purchaseId.raced, ...(giftCode ? { giftCode } : {}) };
}

/**
 * Refunds from Google: the row is marked, and what it granted is taken back.
 * M23 US4 (FR-007, G-M23-5): each refund is ONE transaction. If any step fails, nothing of it
 * is recorded — the purchase stays un-voided and keeps what it granted — so the next run
 * finds it again and retries the whole refund. One failed refund does not stop the others.
 */
export async function applyVoided(db: Db, voided: { purchaseToken: string; voidedAt: number }[]): Promise<{ withdrawn: number; unknown: number; failed?: number }> {
  let withdrawn = 0;
  let unknown = 0;
  let failed = 0;
  for (const v of voided) {
    try {
      const outcome = await db.transaction(async (tx) => {
        const [row] = await tx.query<{ id: string }>(
          "UPDATE purchases SET status = 'refunded', voided_at = to_timestamp($2::double precision / 1000) WHERE purchase_token = $1 AND voided_at IS NULL RETURNING id",
          [v.purchaseToken, v.voidedAt]);
        if (!row) {
          const [known] = await tx.query('SELECT 1 FROM purchases WHERE purchase_token = $1', [v.purchaseToken]);
          return known ? 'seen' as const : 'unknown' as const;
        }
        await tx.query('DELETE FROM entitlements WHERE source_purchase_id = $1', [row.id]);
        await tx.query('DELETE FROM tips WHERE purchase_id = $1', [row.id]);
        // M22 US14 (FR-044, G-M22-9): a refunded gift is cancelled if unclaimed; a claimed one lost its entitlement above.
        await cancelGiftsFor(tx, row.id);
        return 'withdrawn' as const;
      });
      if (outcome === 'withdrawn') withdrawn++;
      if (outcome === 'unknown') { unknown++; console.warn('google refund for a purchase this server never saw'); }
    } catch (e) {
      failed++;
      console.error('google refund failed; the next run retries it', e instanceof Error ? e.message : String(e));
    }
  }
  return { withdrawn, unknown, ...(failed > 0 ? { failed } : {}) };
}

/** Purchases not yet acknowledged (the first try failed): try again, oldest first. */
export async function acknowledgeDue(db: Db, play: GooglePlay): Promise<{ done: number; failed: number }> {
  const rows = await db.query<{ id: string; product_id: string; purchase_token: string }>(
    "SELECT id, product_id, purchase_token FROM purchases WHERE store = 'google' AND acknowledged_at IS NULL AND status = 'active' AND purchase_token IS NOT NULL AND created_at < now() - interval '10 minutes' ORDER BY created_at LIMIT 50");
  let done = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await play.acknowledge(kindOf(r.product_id) === 'plus' ? 'subscription' : 'product', r.product_id, r.purchase_token);
      await db.query('UPDATE purchases SET acknowledged_at = now() WHERE id = $1', [r.id]);
      done++;
    } catch {
      failed++;
    }
  }
  return { done, failed };
}

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

/** SQL: a PLUS row whose interval contains now (alias `e`). */
export const PLUS_LIVE_SQL = "e.kind = 'plus' AND (e.starts_at IS NULL OR e.starts_at <= now()) AND (e.until IS NULL OR e.until > now())";

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
export async function rechainCodes(tx: Db, listenerId: string): Promise<number> {
  const waiting = await tx.query<{ ref: string; starts_at: Date | string; until: Date | string }>(
    `SELECT ref, starts_at, until FROM entitlements
      WHERE listener_id = $1 AND kind = 'plus' AND (ref = $2 OR ref LIKE $3) AND starts_at > now() AND until IS NOT NULL
      ORDER BY starts_at, ref FOR UPDATE`, [listenerId, PLUS_BY_CODE, `${PLUS_BY_CODE}:%`]);
  if (waiting.length === 0) return 0;
  const waitingRefs = waiting.map((w) => w.ref);
  const [base] = await tx.query<{ forever: boolean; until: Date | string | null }>(
    `SELECT bool_or(until IS NULL) AS forever, max(until) AS until FROM entitlements
      WHERE listener_id = $1 AND kind = 'plus' AND NOT (ref = ANY($2::text[])) AND (until IS NULL OR until > now())`, [listenerId, waitingRefs]);
  if (base?.forever) return 0; // PLUS for ever: there is nothing to follow on from
  let cursor = Math.max(Date.now(), base?.until ? new Date(base.until).getTime() : 0);
  let moved = 0;
  for (const w of waiting) {
    const start = new Date(w.starts_at).getTime();
    const length = new Date(w.until).getTime() - start;
    const next = Math.max(start, cursor);
    if (next !== start) {
      await tx.query("UPDATE entitlements SET starts_at = $3, until = $4 WHERE listener_id = $1 AND kind = 'plus' AND ref = $2",
        [listenerId, w.ref, new Date(next).toISOString(), new Date(next + length).toISOString()]);
      moved++;
    }
    cursor = next + length;
  }
  return moved;
}

/** PLUS now, and when its continuous run ends (`plusRun`). Computed, never stored. */
export async function plusUntil(db: Db, listenerId: string): Promise<{ active: boolean; until: string | null }> {
  const rows = await db.query<{ starts_at: Date | string | null; until: Date | string | null }>(
    "SELECT starts_at, until FROM entitlements WHERE listener_id = $1 AND kind = 'plus' AND (until IS NULL OR until > now())", [listenerId]);
  const run = plusRun(rows.map((r) => ({ start: r.starts_at === null ? null : new Date(r.starts_at).getTime(), end: r.until === null ? null : new Date(r.until).getTime() })), Date.now());
  return { active: run.active, until: run.until === null ? null : new Date(run.until).toISOString() };
}

/** Whether this listener has PLUS now (the badge, the icons): any source whose interval holds now. */
export async function hasPlus(db: Db, listenerId: string): Promise<boolean> {
  const [r] = await db.query(`SELECT 1 FROM entitlements e WHERE e.listener_id = $1 AND ${PLUS_LIVE_SQL}`, [listenerId]);
  return Boolean(r);
}

// M26: the wallet page's reads and the sweep's refund-check cache (moved here from routes/).

export type PurchaseListRow = { id: string; store: string; product_id: string; status: string; expires_at: Date | string | null; amount_micros: string | number | null; currency: string | null; created_at: Date | string };
export type EntitlementListRow = { kind: string; ref: string; starts_at: Date | string | null; until: Date | string | null };
export type TipListRow = { id: string; to_feed_url: string; created_at: Date | string; amount_micros: string | number | null; currency: string | null; show_title: string | null };

/** My purchases, newest first (at most 200). */
export async function listPurchaseRows(db: Db, listenerId: string): Promise<PurchaseListRow[]> {
  return db.query<PurchaseListRow>(
    'SELECT id, store, product_id, status, expires_at, amount_micros, currency, created_at FROM purchases WHERE listener_id = $1 ORDER BY created_at DESC LIMIT 200', [listenerId]);
}

/** My entitlements. */
export async function listEntitlementRows(db: Db, listenerId: string): Promise<EntitlementListRow[]> {
  return db.query<EntitlementListRow>(
    'SELECT kind, ref, starts_at, until FROM entitlements WHERE listener_id = $1 ORDER BY kind, ref', [listenerId]);
}

/** The tips I gave, newest first (at most 200), with the show's title. */
export async function listTipRows(db: Db, listenerId: string): Promise<TipListRow[]> {
  return db.query<TipListRow>(
    `SELECT t.id, t.to_feed_url, t.created_at, p.amount_micros, p.currency,
            (SELECT e.show_title FROM episodes e WHERE e.feed_url = t.to_feed_url AND e.show_title IS NOT NULL LIMIT 1) AS show_title
     FROM tips t JOIN purchases p ON p.id = t.purchase_id
     WHERE t.from_listener = $1 ORDER BY t.created_at DESC LIMIT 200`,
    [listenerId],
  );
}

/** When Google's refunds were last read (the `billing:voided` cache row). */
export async function lastVoidedCheckRows(db: Db): Promise<{ fetched_at: Date | string }[]> {
  return db.query<{ fetched_at: Date | string }>("SELECT fetched_at FROM cache WHERE key = 'billing:voided'");
}

/** Remember the last refund read and when it happened. */
export async function saveVoidedCheck(db: Db, v: unknown): Promise<void> {
  await db.query("INSERT INTO cache (key, body, fetched_at) VALUES ('billing:voided', $1::text::jsonb, now()) ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, fetched_at = now()", [JSON.stringify(v)]);
}
