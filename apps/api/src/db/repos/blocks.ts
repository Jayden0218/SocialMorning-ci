/** M6 blocks (FR-006–FR-010): one-way visibility, two-way interaction; a block removes follows both ways. */
import type { Db } from '../db.ts';

export async function block(db: Db, blockerId: string, blockedId: string): Promise<'blocked' | 'no_such_listener'> {
  const exists = await db.query<{ id: string }>('SELECT id FROM listeners WHERE id = $1', [blockedId]);
  if (exists.length === 0) return 'no_such_listener';
  await db.transaction(async (tx) => {
    await tx.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [blockerId, blockedId]);
    await tx.query(
      'DELETE FROM follows WHERE (follower_id = $1 AND followed_id = $2) OR (follower_id = $2 AND followed_id = $1)',
      [blockerId, blockedId],
    );
  });
  return 'blocked';
}

/** FR-010: visibility returns; the follow does not. */
export async function unblock(db: Db, blockerId: string, blockedId: string): Promise<void> {
  await db.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [blockerId, blockedId]);
}

export async function blockedIdsFor(db: Db, viewerId: string): Promise<Set<string>> {
  const rows = await db.query<{ blocked_id: string }>('SELECT blocked_id FROM blocks WHERE blocker_id = $1', [viewerId]);
  return new Set(rows.map((r) => r.blocked_id));
}

export async function listBlocks(db: Db, viewerId: string): Promise<{ id: string; displayName: string; createdAt: string }[]> {
  const rows = await db.query<{ id: string; display_name: string; created_at: string }>(
    'SELECT l.id, l.display_name, b.created_at FROM blocks b JOIN listeners l ON l.id = b.blocked_id WHERE b.blocker_id = $1 ORDER BY b.created_at DESC',
    [viewerId],
  );
  return rows.map((r) => ({ id: r.id, displayName: r.display_name, createdAt: new Date(r.created_at).toISOString() }));
}

/** Has `a` blocked `b`? */
export async function isBlockedBy(db: Db, a: string, b: string): Promise<boolean> {
  return (await db.query('SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [a, b])).length > 0;
}

/** The viewer's newest block or report — part of the social poll's ETag (R1). */
export async function safetyStamp(db: Db, viewerId: string): Promise<string> {
  const [r] = await db.query<{ v: string | null }>(
    `SELECT greatest((SELECT max(created_at) FROM blocks WHERE blocker_id = $1), (SELECT max(created_at) FROM reports WHERE reporter_id = $1))::text AS v`,
    [viewerId],
  );
  return r?.v ?? '-';
}
