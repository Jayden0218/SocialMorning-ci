// Database queries for Studio show bans (M26 F0: moved here from routes/studio/bans.ts).
import type { Db } from '../../db.ts';

export type BanRow = { id: string; display_name: string; reason: string | null; created_at: Date | string };

/** The listeners muted on a show, newest first. */
export async function banRows(db: Db, feedUrl: string): Promise<BanRow[]> {
  return db.query<{ id: string; display_name: string; reason: string | null; created_at: Date | string }>(
    `SELECT l.id, l.display_name, m.reason, m.created_at
       FROM show_mutes m JOIN listeners l ON l.id = m.listener_id
      WHERE m.feed_url = $1 ORDER BY m.created_at DESC`, [feedUrl]);
}

/** One row per team link (proven claim, helper, co-host) the listener has on the show. */
export async function teamRows(db: Db, feedUrl: string, listenerId: string): Promise<Record<string, unknown>[]> {
  return db.query(
    `SELECT 1 FROM creator_claims WHERE feed_url = $1 AND listener_id = $2 AND status = 'proven'
     UNION ALL SELECT 1 FROM show_members WHERE feed_url = $1 AND listener_id = $2
     UNION ALL SELECT 1 FROM show_hosts WHERE feed_url = $1 AND listener_id = $2`, [feedUrl, listenerId]);
}

/** One row when the listener exists. */
export async function listenerExistsRows(db: Db, listenerId: string): Promise<Record<string, unknown>[]> {
  return db.query('SELECT 1 FROM listeners WHERE id = $1', [listenerId]);
}

/** Mute a listener on a show; banning again only updates the reason. */
export async function upsertShowMute(db: Db, feedUrl: string, listenerId: string, by: string, reason: string | null): Promise<void> {
  await db.query(
    `INSERT INTO show_mutes (feed_url, listener_id, muted_by, reason) VALUES ($1, $2, $3, $4)
     ON CONFLICT (feed_url, listener_id) DO UPDATE SET reason = EXCLUDED.reason`, [feedUrl, listenerId, by, reason]);
}

/** Lift a listener's mute on a show. */
export async function deleteShowMute(db: Db, feedUrl: string, listenerId: string): Promise<void> {
  await db.query('DELETE FROM show_mutes WHERE feed_url = $1 AND listener_id = $2', [feedUrl, listenerId]);
}
