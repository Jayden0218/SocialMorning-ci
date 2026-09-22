/** Follows (M4 FR-007): one-way, idempotent both ways, never self (the CHECK is guard G4). */
import type { Db } from '../db.ts';

export type ListenerLite = { id: string; displayName: string | null };

export async function follow(db: Db, followerId: string, followedId: string): Promise<'followed' | 'self' | 'no_such_listener' | 'blocked'> {
  if (followerId === followedId) return 'self';
  const exists = await db.query<{ id: string }>('SELECT id FROM listeners WHERE id = $1', [followedId]);
  if (exists.length === 0) return 'no_such_listener';
  // M6 (FR-008): no follow across a block, in either direction.
  const wall = await db.query('SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)', [followerId, followedId]);
  if (wall.length > 0) return 'blocked';
  await db.query('INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [followerId, followedId]);
  return 'followed';
}

export async function unfollow(db: Db, followerId: string, followedId: string): Promise<void> {
  await db.query('DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2', [followerId, followedId]);
}

export async function isFollowing(db: Db, followerId: string, followedId: string): Promise<boolean> {
  return (await db.query('SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2', [followerId, followedId])).length > 0;
}

export async function counts(db: Db, listenerId: string): Promise<{ followers: number; following: number }> {
  const [r] = await db.query<{ followers: number; following: number }>(
    `SELECT (SELECT count(*)::int FROM follows WHERE followed_id = $1) AS followers,
            (SELECT count(*)::int FROM follows WHERE follower_id = $1) AS following`,
    [listenerId],
  );
  return { followers: Number(r!.followers), following: Number(r!.following) };
}

type Page = { listeners: ListenerLite[]; next?: string };

async function page(db: Db, sql: string, params: unknown[], limit: number): Promise<Page> {
  const rows = await db.query<{ id: string; display_name: string | null; created_at: string }>(sql, params);
  const slice = rows.slice(0, limit);
  const next = rows.length > limit ? new Date(slice[slice.length - 1]!.created_at).toISOString() : undefined;
  return { listeners: slice.map((r) => ({ id: r.id, displayName: r.display_name })), ...(next ? { next } : {}) };
}

const NOT_BLOCKED = `AND ($4::uuid IS NULL OR l.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $4::uuid))`;

export function followers(db: Db, listenerId: string, before?: string, limit = 50, viewerId?: string): Promise<Page> {
  return page(db,
    `SELECT l.id, l.display_name, f.created_at FROM follows f JOIN listeners l ON l.id = f.follower_id
     WHERE f.followed_id = $1 ${NOT_BLOCKED} AND ($3::timestamptz IS NULL OR f.created_at < $3::timestamptz) ORDER BY f.created_at DESC LIMIT $2`,
    [listenerId, limit + 1, before ?? null, viewerId ?? null], limit);
}

export function following(db: Db, listenerId: string, before?: string, limit = 50, viewerId?: string): Promise<Page> {
  return page(db,
    `SELECT l.id, l.display_name, f.created_at FROM follows f JOIN listeners l ON l.id = f.followed_id
     WHERE f.follower_id = $1 ${NOT_BLOCKED} AND ($3::timestamptz IS NULL OR f.created_at < $3::timestamptz) ORDER BY f.created_at DESC LIMIT $2`,
    [listenerId, limit + 1, before ?? null, viewerId ?? null], limit);
}
