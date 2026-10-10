// The paid lane's Postgres mirror (hybrid only): its DynamoDB writes copied onto the rows other lanes still read.
/**
 * M26 lane PD. Lanes not moved yet read the money tables in SQL — the Studio's tips and earnings (ST), paid-episode
 * access (ST), the admin dashboard and user page (SF) — so while the bridge is on (src/db/backend-ddb.ts) every
 * write of this lane is mirrored here, by id, AFTER its DynamoDB transaction committed. DynamoDB is the truth: these
 * functions only copy. CUT deletes this file. Redeem codes and uses have no reader outside this lane: not mirrored.
 */
import type { Db } from '../../../db.ts';
import type { Item } from '../../../ddb/store.ts';

const v = (x: unknown): unknown => (x === undefined ? null : x);

export async function mirrorPurchase(pg: Db, p: Item): Promise<void> {
  await pg.query(
    `INSERT INTO purchases (id, listener_id, store, product_id, store_txn_id, status, expires_at, amount_micros, currency, created_at,
                            purchase_token, ref, acknowledged_at, voided_at, account_hash, test)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, expires_at = EXCLUDED.expires_at, acknowledged_at = EXCLUDED.acknowledged_at,
       voided_at = EXCLUDED.voided_at, account_hash = EXCLUDED.account_hash`,
    [p['id'], p['listenerId'], p['store'], p['productId'], p['storeTxnId'], p['status'], v(p['expiresAt']), v(p['amountMicros']), v(p['currency']),
      p['createdAt'], v(p['purchaseToken']), v(p['ref']), v(p['acknowledgedAt']), v(p['voidedAt']), v(p['accountHash']), Boolean(p['test'])]);
}

/** The listener's entitlement rows become exactly the items (a source purchase not mirrored — a fixture — is left out). */
export async function mirrorEntitlements(pg: Db, listenerId: string, ents: readonly Item[]): Promise<void> {
  await pg.query('DELETE FROM entitlements WHERE listener_id = $1', [listenerId]);
  for (const e of ents) {
    await pg.query(
      `INSERT INTO entitlements (listener_id, kind, ref, until, starts_at, source_purchase_id)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM purchases WHERE id::text = $6))`,
      [listenerId, e['kind'], e['ref'], v(e['until']), v(e['startsAt']), String(e['sourcePurchaseId'] ?? '')]);
  }
}

/** A tip row, or its removal (`tip` undefined: refunded). */
export async function mirrorTip(pg: Db, id: string, tip: Item | undefined): Promise<void> {
  if (!tip) { await pg.query('DELETE FROM tips WHERE id = $1', [id]); return; }
  await pg.query(
    `INSERT INTO tips (id, from_listener, to_feed_url, purchase_id, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
    [tip['id'], tip['fromListener'], tip['toFeedUrl'], tip['purchaseId'], tip['createdAt']]);
}

export async function mirrorGift(pg: Db, g: Item): Promise<void> {
  await pg.query(
    `INSERT INTO gifts (id, code, buyer_id, feed_url, purchase_id, claimed_by, claimed_at, cancelled_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET claimed_by = EXCLUDED.claimed_by, claimed_at = EXCLUDED.claimed_at, cancelled_at = EXCLUDED.cancelled_at`,
    [g['id'], g['code'], g['buyerId'], g['feedUrl'], g['purchaseId'], v(g['claimedBy']), v(g['claimedAt']), v(g['cancelledAt']), g['createdAt']]);
}
