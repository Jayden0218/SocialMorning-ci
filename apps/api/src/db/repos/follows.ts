/** Follows (M4 FR-007): one-way, idempotent both ways, never self (the CHECK is guard G4). */
import type { Db } from '../db.ts';

export type ListenerLite = { id: string; displayName: string | null };

export async function follow(db: Db, followerId: string, followedId: string): Promise<'followed' | 'self' | 'no_such_listener'> {
  if (followerId === followedId) return 'self';
  const exists = await db.query<{ id: string }>('SELECT id FROM listeners WHERE id = $1', [followedId]);
  if (exists.length === 0) return 'no_such_listener';
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

export function followers(db: Db, listenerId: string, before?: string, limit = 50): Promise<Page> {
  return page(db,
    `SELECT l.id, l.display_name, f.created_at FROM follows f JOIN listeners l ON l.id = f.follower_id
     WHERE f.followed_id = $1 ${before ? 'AND f.created_at < $3' : ''} ORDER BY f.created_at DESC LIMIT $2`,
    before ? [listenerId, limit + 1, before] : [listenerId, limit + 1], limit);
}

export function following(db: Db, listenerId: string, before?: string, limit = 50): Promise<Page> {
  return page(db,
    `SELECT l.id, l.display_name, f.created_at FROM follows f JOIN listeners l ON l.id = f.followed_id
     WHERE f.follower_id = $1 ${before ? 'AND f.created_at < $3' : ''} ORDER BY f.created_at DESC LIMIT $2`,
    before ? [listenerId, limit + 1, before] : [listenerId, limit + 1], limit);
}
