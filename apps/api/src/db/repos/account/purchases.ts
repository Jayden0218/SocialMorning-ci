// Grants what a store purchase bought, once, and takes it back when the store reports a refund.
/**
 * M20 US6 (spec FR-020–FR-026; data-model "purchases"; guard G-M20-5). A Google Play purchase is
 * checked with Google first (`GooglePlay`), then written once — `purchase_token` is unique, so a
 * repeated or raced notice finds the same row and grants nothing new. What it grants:
 *  - PLUS → `entitlements (plus, '', until = Google's expiry)`; sending the token again refreshes the expiry
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

export type GrantIn = { listenerId: string; productId: string; purchaseToken: string; feedUrl?: string };
export type Granted = { purchaseId: string; kind: 'plus' | 'show' | 'gift' | 'tip'; status: 'active' | 'expired' | 'refunded'; expiresAt: string | null; repeated: boolean; /** M22 US14: the gift's code */ giftCode?: string };

const ACTIVE = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD']);

export async function grantGoogle(db: Db, play: GooglePlay, p: GrantIn): Promise<Granted> {
  const kind = kindOf(p.productId);
  if (!kind) throw new ApiError('validation', 'No such product.', { fields: ['productId'] });
  const [seen] = await db.query<{ id: string; listener_id: string; status: 'active' | 'expired' | 'refunded'; expires_at: Date | string | null }>(
    'SELECT id, listener_id, status, expires_at FROM purchases WHERE purchase_token = $1', [p.purchaseToken]);
  if (seen && seen.listener_id !== p.listenerId) throw new ApiError('conflict', 'This purchase belongs to another account.');
  if (seen && kind !== 'plus') {
    const giftCode = kind === 'gift' ? await giftForPurchase(db, seen.id) : undefined;
    return { purchaseId: seen.id, kind, status: seen.status, expiresAt: seen.expires_at ? new Date(seen.expires_at).toISOString() : null, repeated: true, ...(giftCode ? { giftCode } : {}) };
  }

  let expiresAt: string | null = null;
  let orderId: string | null = null;
  let acknowledged = false;
  let feedUrl: string | null = null;
  if (kind === 'plus') {
    const s = await play.subscription(p.purchaseToken);
    if (s.productId !== p.productId) throw new ApiError('validation', 'That purchase is for another product.', { fields: ['productId'] });
    if (!ACTIVE.has(s.state)) {
      if (seen) await db.query("UPDATE purchases SET status = 'expired' WHERE id = $1 AND status = 'active'", [seen.id]);
      throw new ApiError('not_paid', 'Google has not taken this payment.');
    }
    expiresAt = s.expiresAt; orderId = s.orderId; acknowledged = s.acknowledged;
  } else {
    if (!p.feedUrl) throw new ApiError('validation', 'Say which show.', { fields: ['feedUrl'] });
    const g = await play.product(p.productId, p.purchaseToken);
    if (g.purchaseState !== 0) throw new ApiError('not_paid', 'Google has not taken this payment.');
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
      await tx.query("UPDATE purchases SET status = 'active', expires_at = $2 WHERE id = $1", [id, expiresAt]);
    } else {
      const [row] = await tx.query<{ id: string }>(
        `INSERT INTO purchases (listener_id, store, product_id, store_txn_id, status, expires_at, purchase_token, ref)
         VALUES ($1, 'google', $2, $3, 'active', $4, $5, $6) ON CONFLICT (purchase_token) DO NOTHING RETURNING id`,
        [p.listenerId, p.productId, orderId ?? p.purchaseToken, expiresAt, p.purchaseToken, feedUrl]);
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

/** Refunds from Google: the row is marked, and what it granted is taken back. */
export async function applyVoided(db: Db, voided: { purchaseToken: string; voidedAt: number }[]): Promise<{ withdrawn: number; unknown: number }> {
  let withdrawn = 0;
  let unknown = 0;
  for (const v of voided) {
    const [row] = await db.query<{ id: string }>(
      "UPDATE purchases SET status = 'refunded', voided_at = to_timestamp($2::double precision / 1000) WHERE purchase_token = $1 AND voided_at IS NULL RETURNING id",
      [v.purchaseToken, v.voidedAt]);
    if (!row) {
      const [known] = await db.query('SELECT 1 FROM purchases WHERE purchase_token = $1', [v.purchaseToken]);
      if (!known) { unknown++; console.warn('google refund for a purchase this server never saw'); }
      continue;
    }
    await db.query('DELETE FROM entitlements WHERE source_purchase_id = $1', [row.id]);
    await db.query('DELETE FROM tips WHERE purchase_id = $1', [row.id]);
    // M22 US14 (FR-044, G-M22-9): a refunded gift is cancelled if unclaimed; a claimed one lost its entitlement above.
    await cancelGiftsFor(db, row.id);
    withdrawn++;
  }
  return { withdrawn, unknown };
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

/** Whether this listener has PLUS now (the badge, the icons). Computed, never stored. */
export async function hasPlus(db: Db, listenerId: string): Promise<boolean> {
  const [r] = await db.query("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'plus' AND (until IS NULL OR until > now())", [listenerId]);
  return Boolean(r);
}
