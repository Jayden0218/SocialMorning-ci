/**
 * M11 US6 — the owner's helpers (operators) and giving the show back (FR-025, FR-026).
 * There is no handle in this product, so an operator is added by their account's email.
 */
import type { Db } from '../db.ts';
import { ApiError } from '../../errors.ts';

export const MAX_OPERATORS = 10;

export async function team(db: Db, feedUrl: string) {
  const [owner] = await db.query<{ id: string; display_name: string; email: string }>(
    "SELECT l.id, l.display_name, l.email FROM creator_claims c JOIN listeners l ON l.id = c.listener_id WHERE c.feed_url = $1 AND c.status = 'proven'", [feedUrl]);
  const ops = await db.query<{ id: string; display_name: string; email: string; created_at: Date | string }>(
    'SELECT l.id, l.display_name, l.email, m.created_at FROM show_members m JOIN listeners l ON l.id = m.listener_id WHERE m.feed_url = $1 ORDER BY m.created_at', [feedUrl]);
  return {
    owner: owner ? { id: owner.id, displayName: owner.display_name, email: owner.email } : null,
    operators: ops.map((o) => ({ id: o.id, displayName: o.display_name, email: o.email, addedAt: new Date(o.created_at).toISOString() })),
    slotsLeft: Math.max(0, MAX_OPERATORS - ops.length),
  };
}

/** Adds by exact email. The count and the insert share a lock, so two tabs cannot both take slot 10. */
export async function addOperator(db: Db, feedUrl: string, email: string, by: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`team|${feedUrl}`]);
    const [l] = await tx.query<{ id: string }>('SELECT id FROM listeners WHERE email = $1 AND suspended_at IS NULL', [email.trim().toLowerCase()]);
    if (!l) throw new ApiError('not_found', 'No SocialMorning account uses that email. Ask them to sign up in the app first.', { reason: 'no_account' });
    const [isOwner] = await tx.query("SELECT 1 FROM creator_claims WHERE feed_url = $1 AND listener_id = $2 AND status = 'proven'", [feedUrl, l.id]);
    if (isOwner) throw new ApiError('conflict', 'That is you — the owner already has every right.', { reason: 'already_member' });
    const [already] = await tx.query('SELECT 1 FROM show_members WHERE feed_url = $1 AND listener_id = $2', [feedUrl, l.id]);
    if (already) throw new ApiError('conflict', 'They already help with this show.', { reason: 'already_member' });
    const [n] = await tx.query<{ n: string | number }>('SELECT count(*) AS n FROM show_members WHERE feed_url = $1', [feedUrl]);
    if (Number(n?.n ?? 0) >= MAX_OPERATORS) throw new ApiError('conflict', `A show can have ${MAX_OPERATORS} helpers.`, { reason: 'full' });
    await tx.query('INSERT INTO show_members (feed_url, listener_id, added_by) VALUES ($1, $2, $3)', [feedUrl, l.id, by]);
  });
}

export async function removeOperator(db: Db, feedUrl: string, listenerId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(listenerId)) return;
  await db.query('DELETE FROM show_members WHERE feed_url = $1 AND listener_id = $2', [feedUrl, listenerId]);
}

/**
 * Give the show back (FR-026): the claim is revoked and everything that depended on it stops
 * applying — overrides, helpers, mutes; open polls close. Announcements and host hides stay as
 * history (a hide can still be undone from /mod). The feed may then be claimed again.
 */
export async function release(db: Db, feedUrl: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("UPDATE creator_claims SET status = 'revoked' WHERE feed_url = $1 AND status = 'proven'", [feedUrl]);
    await tx.query('DELETE FROM show_members WHERE feed_url = $1', [feedUrl]);
    await tx.query('DELETE FROM show_mutes WHERE feed_url = $1', [feedUrl]);
    await tx.query('DELETE FROM show_overrides WHERE feed_url = $1', [feedUrl]);
    await tx.query('UPDATE polls SET closed_at = now() WHERE feed_url = $1 AND closed_at IS NULL', [feedUrl]);
  });
}
