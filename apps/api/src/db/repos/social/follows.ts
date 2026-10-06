// Follow and unfollow listeners, and list followers and following.
/** Follows (M4 FR-007): one-way, idempotent both ways, never self (the CHECK is guard G4). */
import type { Db } from '../../db.ts';
import { notify } from './notifications.ts';

export type ListenerLite = { id: string; displayName: string | null; avatarUrl?: string; /** M21 US8 */ bio?: string; youFollow?: boolean };

export async function follow(db: Db, followerId: string, followedId: string): Promise<'followed' | 'self' | 'no_such_listener' | 'blocked'> {
  if (followerId === followedId) return 'self';
  const exists = await db.query<{ id: string }>('SELECT id FROM listeners WHERE id = $1', [followedId]);
  if (exists.length === 0) return 'no_such_listener';
  // M6 (FR-008): no follow across a block, in either direction.
  const wall = await db.query('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [followerId, followedId]);
  if (wall.length > 0) return 'blocked';
  const added = await db.query('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1', [followerId, followedId]);
  // M21 US10 (G-M21-9): a new follow tells the followed listener, in the caller's transaction.
  if (added.length > 0) await notify(db, { recipientId: followedId, actorId: followerId, kind: 'follow' });
  return 'followed';
}

export async function unfollow(db: Db, followerId: string, followedId: string): Promise<void> {
  await db.query('DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2', [followerId, followedId]);
}

export async function isFollowing(db: Db, followerId: string, followedId: string): Promise<boolean> {
  return (await db.query('SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2', [followerId, followedId])).length > 0;
}

const NOT_BLOCKED = `AND ($4::uuid IS NULL OR l.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $4::uuid))`;
/** The same rule as NOT_BLOCKED, with the viewer as the second parameter (for `counts`). */
const NOT_BLOCKED_2 = `AND ($2::uuid IS NULL OR l.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $2::uuid))`;

/**
 * M16a bug 2 (FR-003): a count is the number of people its list can show the viewer. The lists
 * below leave out listeners the viewer blocked (NOT_BLOCKED); the counts did not, so a profile
 * could say more followers than its list would ever hold. Both now use the same rule.
 */
export async function counts(db: Db, listenerId: string, viewerId?: string): Promise<{ followers: number; following: number }> {
  const [r] = await db.query<{ followers: number; following: number }>(
    `SELECT (SELECT count(*)::int FROM follows f JOIN listeners l ON l.id = f.follower_id WHERE f.followed_id = $1 ${NOT_BLOCKED_2}) AS followers,
            (SELECT count(*)::int FROM follows f JOIN listeners l ON l.id = f.followed_id WHERE f.follower_id = $1 ${NOT_BLOCKED_2}) AS following`,
    [listenerId, viewerId ?? null],
  );
  return { followers: Number(r!.followers), following: Number(r!.following) };
}

type Page = { listeners: ListenerLite[]; next?: string };

/**
 * M21 US8 (FR-074): each row also carries the one-line bio (when set) and, for a signed-in viewer,
 * `youFollow` — so the list can show a Follow button. Signed out, neither field is added.
 */
async function page(db: Db, sql: string, params: unknown[], limit: number): Promise<Page> {
  const rows = await db.query<{ id: string; display_name: string | null; created_at: string; avatar_url?: string | null; bio?: string | null; you_follow?: boolean | null }>(sql, params);
  const slice = rows.slice(0, limit);
  const next = rows.length > limit ? new Date(slice[slice.length - 1]!.created_at).toISOString() : undefined;
  return { listeners: slice.map((r) => ({
    id: r.id, displayName: r.display_name, ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
    ...(r.bio ? { bio: r.bio } : {}), ...(r.you_follow === true || r.you_follow === false ? { youFollow: r.you_follow } : {}),
  })), ...(next ? { next } : {}) };
}

/** `youFollow`: NULL when signed out (left off the row), else whether the viewer ($4) follows the row. */
const YOU_FOLLOW = `CASE WHEN $4::uuid IS NULL THEN NULL ELSE EXISTS (SELECT 1 FROM follows y WHERE y.follower_id = $4::uuid AND y.followed_id = l.id) END AS you_follow`;


export function followers(db: Db, listenerId: string, before?: string, limit = 50, viewerId?: string): Promise<Page> {
  return page(db,
    `SELECT l.id, l.display_name, l.avatar_url, l.bio, ${YOU_FOLLOW}, f.created_at FROM follows f JOIN listeners l ON l.id = f.follower_id
     WHERE f.followed_id = $1 ${NOT_BLOCKED} AND ($3::timestamptz IS NULL OR f.created_at < $3::timestamptz) ORDER BY f.created_at DESC LIMIT $2`,
    [listenerId, limit + 1, before ?? null, viewerId ?? null], limit);
}

export function following(db: Db, listenerId: string, before?: string, limit = 50, viewerId?: string): Promise<Page> {
  return page(db,
    `SELECT l.id, l.display_name, l.avatar_url, l.bio, ${YOU_FOLLOW}, f.created_at FROM follows f JOIN listeners l ON l.id = f.followed_id
     WHERE f.follower_id = $1 ${NOT_BLOCKED} AND ($3::timestamptz IS NULL OR f.created_at < $3::timestamptz) ORDER BY f.created_at DESC LIMIT $2`,
    [listenerId, limit + 1, before ?? null, viewerId ?? null], limit);
}
