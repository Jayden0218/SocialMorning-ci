// Feed moves: every live subscription follows a publisher's new feed address, in one transaction.
import type { Db } from '../../db.ts';

/**
 * Tombstones every live subscription to `from`, subscribes the same listeners to `to` (a listener
 * already on `to` keeps that row), and records the unsub/sub events. Returns how many moved.
 */
export async function moveSubscriptionsToFeed(db: Db, from: string, to: string): Promise<number> {
  return db.transaction(async (tx) => {
    const moved = await tx.query<{ listener_id: string }>(
      'UPDATE subscriptions SET deleted_at = now() WHERE feed_url = $1 AND deleted_at IS NULL RETURNING listener_id', [from]);
    if (moved.length === 0) return 0;
    const ids = moved.map((m) => m.listener_id);
    await tx.query(
      `INSERT INTO subscriptions (listener_id, feed_url, created_at)
       SELECT id, $2, now() FROM unnest($1::uuid[]) AS id
       ON CONFLICT (listener_id, feed_url) DO UPDATE SET deleted_at = NULL, created_at = now() WHERE subscriptions.deleted_at IS NOT NULL`,
      [ids, to]);
    await tx.query(
      `INSERT INTO subscription_events (listener_id, feed_url, kind, at)
       SELECT id, $2, 'unsub', now() FROM unnest($1::uuid[]) AS id
       UNION ALL SELECT id, $3, 'sub', now() FROM unnest($1::uuid[]) AS id`,
      [ids, from, to]);
    return moved.length;
  });
}
