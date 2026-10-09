// Database queries for the /mod page's Studio shows list and take-down (M26: moved here from pages/mod.ts).
import type { Db } from '../../db.ts';

export type CreatedShowRow = { id: string; title: string; feed_url: string; owner: string | null; created_at: Date | string; updated_at: Date | string; eps: number; hidden: boolean };

/** The last 50 live shows created in the Studio, newest change first. */
export async function studioCreatedShows(db: Db): Promise<CreatedShowRow[]> {
  return db.query<CreatedShowRow>(
      `SELECT h.id, h.title, h.feed_url, l.display_name AS owner, h.created_at, h.updated_at,
              (SELECT count(*)::int FROM hosted_episodes e WHERE e.show_id = h.id AND e.deleted_at IS NULL) AS eps,
              EXISTS (SELECT 1 FROM hidden_feeds f WHERE f.feed_url = h.feed_url) AS hidden
         FROM hosted_shows h LEFT JOIN listeners l ON l.id = h.owner_id WHERE h.deleted_at IS NULL ORDER BY h.updated_at DESC LIMIT 50`);
}

/** Marks a live hosted show deleted; returns its feed address (no row when it was already gone). */
export async function markHostedShowDeleted(db: Db, id: string): Promise<{ feed_url: string }[]> {
  return db.query<{ feed_url: string }>('UPDATE hosted_shows SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING feed_url', [id]);
}

/** The rest of a take-down: its episodes go, its proven claims are revoked, and the hide is recorded. */
export async function finishTakedown(db: Db, showId: string, feedUrl: string, actorId: string): Promise<void> {
  await db.query('UPDATE hosted_episodes SET deleted_at = now() WHERE show_id = $1 AND deleted_at IS NULL', [showId]);
  await db.query("UPDATE creator_claims SET status = 'revoked' WHERE feed_url = $1 AND status = 'proven'", [feedUrl]);
  await db.query("INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, 'hide_show', 'show', $2)", [actorId, feedUrl]);
}
