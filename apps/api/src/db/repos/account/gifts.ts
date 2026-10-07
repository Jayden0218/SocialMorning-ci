// Gifts of a paid show: a code made after the store purchase is verified, claimed once, withdrawn on a refund.
/**
 * M22 US14 (FR-042–FR-044; research R12; guard G-M22-9). A gift is a `gift_tier_n` Google Play
 * purchase, verified exactly like `show_tier_n` (`grantGoogle`), that grants the BUYER nothing:
 * it makes a `gifts` row with a random 16-character code. The first signed-in listener who claims
 * the code gets an `entitlements (show, feed URL)` row whose `source_purchase_id` is the gift's
 * purchase — so a refund (`applyVoided`) deletes that entitlement (withdrawn) and also marks an
 * unclaimed gift cancelled. Claiming is one guarded UPDATE: a second claim finds `claimed_by` set.
 */
import { randomBytes } from 'node:crypto';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

/** No 0/O, 1/I/L: a code read aloud or typed from a screenshot. 32 symbols × 16 = 80 bits. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789a';
export const GIFT_CODE_LENGTH = 16;
const CODE = /^[A-Za-z0-9]{16}$/;

export function newGiftCode(): string {
  const bytes = randomBytes(GIFT_CODE_LENGTH);
  let out = '';
  for (const b of bytes) out += ALPHABET.charAt(b & 31);
  return out;
}

export const giftUrl = (publicBase: string, code: string): string => `${publicBase.replace(/\/$/, '')}/gift/${code}`;

/** Called inside the purchase transaction; a repeated purchase token finds the gift already made. */
export async function createGift(db: Db, p: { buyerId: string; feedUrl: string; purchaseId: string }): Promise<string> {
  const [seen] = await db.query<{ code: string }>('SELECT code FROM gifts WHERE purchase_id = $1', [p.purchaseId]);
  if (seen) return seen.code.trim();
  for (let i = 0; i < 5; i++) {
    const code = newGiftCode();
    const [row] = await db.query<{ code: string }>(
      'INSERT INTO gifts (code, buyer_id, feed_url, purchase_id) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING RETURNING code',
      [code, p.buyerId, p.feedUrl, p.purchaseId]);
    if (row) return row.code.trim();
  }
  throw new Error('could not make a unique gift code');
}

export async function giftForPurchase(db: Db, purchaseId: string): Promise<string | undefined> {
  const [r] = await db.query<{ code: string }>('SELECT code FROM gifts WHERE purchase_id = $1', [purchaseId]);
  return r?.code.trim();
}

type GiftRow = { id: string; code: string; buyer_id: string; feed_url: string; purchase_id: string; claimed_by: string | null; claimed_at: Date | string | null; cancelled_at: Date | string | null; created_at: Date | string };

async function showOf(db: Db, feedUrl: string): Promise<{ feedUrl: string; title: string; artworkUrl: string | null }> {
  const [h] = await db.query<{ title: string | null; artwork: string | null }>(
    `SELECT coalesce(o.title, h.title, (SELECT e.show_title FROM episodes e WHERE e.feed_url = $1 AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS title,
            coalesce(h.cover_url, (SELECT e.image_url FROM episodes e WHERE e.feed_url = $1 AND e.image_url IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS artwork
       FROM (SELECT $1::text AS feed_url) x
       LEFT JOIN hosted_shows h ON h.feed_url = x.feed_url AND h.deleted_at IS NULL
       LEFT JOIN show_overrides o ON o.feed_url = x.feed_url`, [feedUrl]);
  return { feedUrl, title: h?.title ?? 'A paid series', artworkUrl: h?.artwork ?? null };
}

/** GET /v1/gifts/:code — what the link offers. Unknown code → 404. */
export async function giftByCode(db: Db, code: string): Promise<{ show: { feedUrl: string; title: string; artworkUrl: string | null }; claimed: boolean; cancelled: boolean; buyerName: string | null }> {
  if (!CODE.test(code)) throw new ApiError('not_found', 'No such gift.');
  const [g] = await db.query<GiftRow & { buyer_name: string | null }>(
    'SELECT g.*, l.display_name AS buyer_name FROM gifts g LEFT JOIN listeners l ON l.id = g.buyer_id AND l.hidden_at IS NULL WHERE g.code = $1', [code]);
  if (!g) throw new ApiError('not_found', 'No such gift.');
  return { show: await showOf(db, g.feed_url), claimed: g.claimed_by !== null, cancelled: g.cancelled_at !== null, buyerName: g.buyer_name };
}

/** POST /v1/gifts/:code/claim — once (409 already_claimed), not to an owner (409 already_owned), not after a refund (410). */
export async function claimGift(db: Db, code: string, listenerId: string): Promise<{ feedUrl: string }> {
  if (!CODE.test(code)) throw new ApiError('not_found', 'No such gift.');
  return db.transaction(async (tx) => {
    const [g] = await tx.query<GiftRow>('SELECT * FROM gifts WHERE code = $1 FOR UPDATE', [code]);
    if (!g) throw new ApiError('not_found', 'No such gift.');
    if (g.cancelled_at !== null) throw new ApiError('cancelled', 'This gift was refunded, so it can no longer be claimed.');
    if (g.claimed_by !== null) throw new ApiError('already_claimed', 'Already claimed.');
    const [owns] = await tx.query("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show' AND ref = $2", [listenerId, g.feed_url]);
    // FR-043: the link stays unclaimed for someone else.
    if (owns) throw new ApiError('already_owned', 'You already have this series. The link still works for someone else.');
    const [won] = await tx.query<{ id: string }>(
      'UPDATE gifts SET claimed_by = $2, claimed_at = now() WHERE id = $1 AND claimed_by IS NULL AND cancelled_at IS NULL RETURNING id', [g.id, listenerId]);
    if (!won) throw new ApiError('already_claimed', 'Already claimed.');
    await tx.query(
      `INSERT INTO entitlements (listener_id, kind, ref, until, source_purchase_id) VALUES ($1, 'show', $2, NULL, $3)
       ON CONFLICT (listener_id, kind, ref) DO NOTHING`, [listenerId, g.feed_url, g.purchase_id]);
    return { feedUrl: g.feed_url };
  });
}

/** GET /v1/me/gifts — the buyer's gifts, newest first, with whether each was claimed (never by whom). */
export async function myGifts(db: Db, buyerId: string, publicBase: string): Promise<{ items: { code: string; url: string; feedUrl: string; title: string; claimed: boolean; cancelled: boolean; createdAt: string }[] }> {
  const rows = await db.query<GiftRow>('SELECT * FROM gifts WHERE buyer_id = $1 ORDER BY created_at DESC LIMIT 100', [buyerId]);
  const items = await Promise.all(rows.map(async (g) => {
    const show = await showOf(db, g.feed_url);
    const code = g.code.trim();
    return { code, url: giftUrl(publicBase, code), feedUrl: g.feed_url, title: show.title, claimed: g.claimed_by !== null, cancelled: g.cancelled_at !== null, createdAt: new Date(g.created_at).toISOString() };
  }));
  return { items };
}

/** A refund: an unclaimed gift is cancelled. (A claimed one's entitlement goes with `source_purchase_id`.) */
export async function cancelGiftsFor(db: Db, purchaseId: string): Promise<void> {
  await db.query('UPDATE gifts SET cancelled_at = now() WHERE purchase_id = $1 AND cancelled_at IS NULL', [purchaseId]);
}
