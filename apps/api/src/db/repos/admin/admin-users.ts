// Database queries for the admin user pages: search, one account in full, PLUS by hand, photo and bio removal, the deletion queue (M26: moved here from routes/admin/).
import type { Db } from '../../db.ts';

export type UserRow = { id: string; display_name: string; email: string; created_at: Date | string; suspended_at: Date | string | null; made_by: string | null };
export type MoneyRow = { id: string; product_id: string; store: string; status: string; amount_micros: string | number | null; currency: string | null; created_at: Date | string; expires_at: Date | string | null };

export async function userRowById(db: Db, id: string): Promise<UserRow[]> {
  return db.query<UserRow>('SELECT id, display_name, email, created_at, suspended_at, made_by FROM listeners WHERE id = $1', [id]);
}

/** `like` is the search text with `\`, `%` and `_` already escaped. */
export async function searchUsers(db: Db, like: string): Promise<UserRow[]> {
  return db.query<UserRow>(
      `SELECT id, display_name, email, created_at, suspended_at, made_by FROM listeners
        WHERE display_name ILIKE '%' || $1 || '%' OR email::text ILIKE '%' || $1 || '%'
        ORDER BY (display_name ILIKE $1 || '%') DESC, lower(display_name), id LIMIT 50`, [like]);
}

export async function renameListener(db: Db, id: string, displayName: string): Promise<void> {
  await db.query('UPDATE listeners SET display_name = $2 WHERE id = $1', [id, displayName]);
}

export async function profileExtras(db: Db, id: string): Promise<{ avatar_url: string | null; bio: string | null; sessions: number }[]> {
  return db.query<{ avatar_url: string | null; bio: string | null; sessions: number }>(
      `SELECT avatar_url, bio, (SELECT count(*)::int FROM sessions s WHERE s.listener_id = l.id) AS sessions FROM listeners l WHERE l.id = $1`, [id]);
}

export async function plusEntitlements(db: Db, id: string): Promise<{ ref: string; until: Date | string | null; source_purchase_id: string | null }[]> {
  return db.query<{ ref: string; until: Date | string | null; source_purchase_id: string | null }>(
      "SELECT ref, until, source_purchase_id FROM entitlements WHERE listener_id = $1 AND kind = 'plus' ORDER BY until DESC NULLS FIRST", [id]);
}

export async function purchasesOf(db: Db, id: string): Promise<MoneyRow[]> {
  return db.query<MoneyRow>(
      'SELECT id, product_id, store, status, amount_micros, currency, created_at, expires_at FROM purchases WHERE listener_id = $1 ORDER BY created_at DESC LIMIT 100', [id]);
}

export async function tipsSentBy(db: Db, id: string): Promise<{ id: string; to_feed_url: string; created_at: Date | string; status: string }[]> {
  return db.query<{ id: string; to_feed_url: string; created_at: Date | string; status: string }>(
      'SELECT t.id, t.to_feed_url, t.created_at, p.status FROM tips t JOIN purchases p ON p.id = t.purchase_id WHERE t.from_listener = $1 ORDER BY t.created_at DESC LIMIT 100', [id]);
}

export async function giftsOf(db: Db, id: string): Promise<{ id: string; feed_url: string; bought: boolean; claimed_at: Date | string | null; cancelled_at: Date | string | null; created_at: Date | string }[]> {
  return db.query<{ id: string; feed_url: string; bought: boolean; claimed_at: Date | string | null; cancelled_at: Date | string | null; created_at: Date | string }>(
      `SELECT id, feed_url, buyer_id = $1 AS bought, claimed_at, cancelled_at, created_at FROM gifts WHERE buyer_id = $1 OR claimed_by = $1 ORDER BY created_at DESC LIMIT 100`, [id]);
}

export async function reportsAgainst(db: Db, id: string): Promise<{ id: string; target_kind: string; target_id: string; reason: string; created_at: Date | string; close_reason: string | null }[]> {
  return db.query<{ id: string; target_kind: string; target_id: string; reason: string; created_at: Date | string; close_reason: string | null }>(
      `SELECT id, target_kind, target_id, reason, created_at, close_reason FROM reports
        WHERE (target_kind = 'profile' AND target_id = $1::text) OR snapshot->>'authorId' = $1::text ORDER BY created_at DESC LIMIT 50`, [id]);
}

export async function openDeletionOf(db: Db, id: string): Promise<{ requested_at: Date | string; due_at: Date | string }[]> {
  return db.query<{ requested_at: Date | string; due_at: Date | string }>('SELECT requested_at, due_at FROM account_deletions WHERE listener_id = $1 AND cancelled_at IS NULL', [id]);
}

export async function studioShowsOf(db: Db, id: string): Promise<{ feed_url: string; title: string; hidden: boolean }[]> {
  return db.query<{ feed_url: string; title: string; hidden: boolean }>(
      `SELECT h.feed_url, h.title, EXISTS (SELECT 1 FROM hidden_feeds f WHERE f.feed_url = h.feed_url) AS hidden
         FROM hosted_shows h WHERE h.owner_id = $1 AND h.deleted_at IS NULL ORDER BY h.created_at DESC LIMIT 50`, [id]);
}

/** PLUS for `days` from now under `ref` (the admin's grant), no purchase. */
export async function grantPlusByAdmin(db: Db, id: string, ref: string, days: number): Promise<void> {
  await db.query(
        `INSERT INTO entitlements (listener_id, kind, ref, until) VALUES ($1, 'plus', $2, now() + make_interval(days => $3::int))
         ON CONFLICT (listener_id, kind, ref) DO UPDATE SET until = excluded.until`, [id, ref, days]);
}

/** Every PLUS row goes, bought or given. */
export async function revokeAllPlus(db: Db, id: string): Promise<Record<string, unknown>[]> {
  return db.query("DELETE FROM entitlements WHERE listener_id = $1 AND kind = 'plus'", [id]);
}

export async function avatarUrlOf(db: Db, id: string): Promise<{ avatar_url: string | null }[]> {
  return db.query<{ avatar_url: string | null }>('SELECT avatar_url FROM listeners WHERE id = $1', [id]);
}

export async function clearAvatar(db: Db, id: string): Promise<Record<string, unknown>[]> {
  return db.query('UPDATE listeners SET avatar_url = NULL, avatar_path = NULL, avatar_bytes = NULL WHERE id = $1', [id]);
}

export async function clearBio(db: Db, id: string): Promise<Record<string, unknown>[]> {
  return db.query('UPDATE listeners SET bio = NULL WHERE id = $1', [id]);
}

export async function openReportCount(db: Db, kind: string, id: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>('SELECT count(*)::int AS n FROM reports WHERE target_kind = $1 AND target_id = $2 AND closed_at IS NULL', [kind, id]);
}

export type PendingDeletionRow = { listener_id: string; display_name: string; email: string; requested_at: Date | string; due_at: Date | string };

/** The account deletion queue (US7), soonest first. */
export async function pendingDeletions(db: Db): Promise<PendingDeletionRow[]> {
  return db.query<PendingDeletionRow>(
      `SELECT d.listener_id, l.display_name, l.email::text AS email, d.requested_at, d.due_at
         FROM account_deletions d JOIN listeners l ON l.id = d.listener_id
        WHERE d.cancelled_at IS NULL ORDER BY d.due_at ASC LIMIT 500`);
}

/** A live Studio show that sells something (a redeem code can give only such a show). */
export async function paidHostedShowRows(db: Db, feedUrl: string): Promise<Record<string, unknown>[]> {
  return db.query('SELECT 1 FROM hosted_shows WHERE feed_url = $1 AND deleted_at IS NULL AND price_tier IS NOT NULL', [feedUrl]);
}
