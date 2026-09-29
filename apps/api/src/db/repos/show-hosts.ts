/**
 * M14 US2 — hosts are real accounts, added the way 小宇宙 adds them: the owner makes an invite
 * link, the host opens it signed in and accepts (FR-02). The token is 24 random bytes, stored
 * only as its hash; one use; 4 days; revocable. At most 5 hosts per show.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.ts';
import { ApiError } from '../../errors.ts';

export const INVITE_DAYS = 4;
export const MAX_HOSTS = 5;
const hashOf = (token: string) => createHash('sha256').update('invite|').update(token).digest();

export async function createInvite(db: Db, feedUrl: string, by: string): Promise<{ id: string; token: string; expiresAt: string }> {
  const token = randomBytes(24).toString('base64url');
  const [r] = await db.query<{ id: string; expires_at: Date | string }>(
    `INSERT INTO show_invites (feed_url, token_hash, created_by, expires_at) VALUES ($1, $2, $3, now() + interval '${INVITE_DAYS} days') RETURNING id, expires_at`,
    [feedUrl, hashOf(token), by],
  );
  return { id: r!.id, token, expiresAt: new Date(r!.expires_at).toISOString() };
}

export async function openInvites(db: Db, feedUrl: string) {
  const rows = await db.query<{ id: string; created_at: Date | string; expires_at: Date | string }>(
    'SELECT id, created_at, expires_at FROM show_invites WHERE feed_url = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC',
    [feedUrl]);
  return rows.map((r) => ({ id: r.id, createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString() }));
}

export async function revokeInvite(db: Db, feedUrl: string, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await db.query('UPDATE show_invites SET revoked_at = now() WHERE id = $1 AND feed_url = $2 AND used_at IS NULL', [id, feedUrl]);
}

type InviteRow = { id: string; feed_url: string; expires_at: Date | string; used_at: Date | string | null; revoked_at: Date | string | null };

/** What the invite is for, and whether it can still be used — for the accept page. */
export async function previewInvite(db: Db, token: string) {
  const [r] = await db.query<InviteRow & { title: string | null }>(
    `SELECT i.id, i.feed_url, i.expires_at, i.used_at, i.revoked_at,
            coalesce((SELECT h.title FROM hosted_shows h WHERE h.feed_url = i.feed_url AND h.deleted_at IS NULL),
                     (SELECT coalesce(e.show_title, e.title) FROM episodes e WHERE e.feed_url = i.feed_url ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS title
       FROM show_invites i WHERE i.token_hash = $1`, [hashOf(token)]);
  if (!r) return { state: 'unknown' as const };
  const state = r.revoked_at ? 'revoked' : r.used_at ? 'used' : new Date(r.expires_at).getTime() <= Date.now() ? 'expired' : 'open';
  return { state, showTitle: r.title, expiresAt: new Date(r.expires_at).toISOString() };
}

/** Accept: one use, not expired, not revoked, the show still claimed, under the host limit (guard G-I1). */
export async function acceptInvite(db: Db, token: string, listenerId: string): Promise<{ feedUrl: string }> {
  return db.transaction(async (tx) => {
    const [r] = await tx.query<InviteRow>('SELECT id, feed_url, expires_at, used_at, revoked_at FROM show_invites WHERE token_hash = $1 FOR UPDATE', [hashOf(token)]);
    if (!r || r.revoked_at) throw new ApiError('not_found', 'This invite link is not valid. Ask the show\'s owner for a new one.');
    if (r.used_at) throw new ApiError('conflict', 'This invite link was already used.', { reason: 'used' });
    if (new Date(r.expires_at).getTime() <= Date.now()) throw new ApiError('conflict', 'This invite link has expired. Ask the show\'s owner for a new one.', { reason: 'expired' });
    const [claimed] = await tx.query("SELECT 1 FROM creator_claims WHERE feed_url = $1 AND status = 'proven'", [r.feed_url]);
    if (!claimed) throw new ApiError('not_found', 'This show no longer exists.');
    const [n] = await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM show_hosts WHERE feed_url = $1', [r.feed_url]);
    if (Number(n?.n ?? 0) >= MAX_HOSTS) throw new ApiError('conflict', `A show can have ${MAX_HOSTS} hosts.`, { reason: 'full' });
    await tx.query('INSERT INTO show_hosts (feed_url, listener_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r.feed_url, listenerId]);
    await tx.query('UPDATE show_invites SET used_at = now(), used_by = $2 WHERE id = $1', [r.id, listenerId]);
    return { feedUrl: r.feed_url };
  });
}

export async function listHosts(db: Db, feedUrl: string) {
  const rows = await db.query<{ id: string; display_name: string; added_at: Date | string }>(
    'SELECT l.id, l.display_name, h.added_at FROM show_hosts h JOIN listeners l ON l.id = h.listener_id WHERE h.feed_url = $1 ORDER BY h.added_at', [feedUrl]);
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, addedAt: new Date(r.added_at).toISOString() }));
}

export async function removeHost(db: Db, feedUrl: string, listenerId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(listenerId)) return;
  await db.query('DELETE FROM show_hosts WHERE feed_url = $1 AND listener_id = $2', [feedUrl, listenerId]);
}
