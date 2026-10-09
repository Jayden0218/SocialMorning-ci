// Database queries for hiding a show or an episode everywhere from Admin (M26: moved here from routes/admin/lists.ts).
import type { Db } from '../../db.ts';

export type HiddenShowRow = { feed_url: string; reason: string | null; hidden_at: Date | string; title: string | null; by_report: boolean };
export type HiddenEpRow = { feed_url: string; guid: string; reason: string | null; hidden_at: Date | string; title: string | null; show_title: string | null; hidden_by: string | null };

export async function hiddenShowRows(db: Db): Promise<HiddenShowRow[]> {
  return db.query<HiddenShowRow>(
      `SELECT h.feed_url, h.reason, h.hidden_at,
              (SELECT e.show_title FROM episodes e WHERE e.feed_url = h.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1) AS title,
              EXISTS (SELECT 1 FROM reports r WHERE r.closed_by = h.action_id) AS by_report
         FROM hidden_feeds h ORDER BY h.hidden_at DESC LIMIT 500`);
}

export async function hiddenEpisodeRows(db: Db): Promise<HiddenEpRow[]> {
  return db.query<HiddenEpRow>(
      `SELECT h.feed_url, h.guid, h.reason, h.hidden_at, e.title, e.show_title, h.hidden_by::text AS hidden_by
         FROM hidden_episodes h LEFT JOIN episodes e ON e.feed_url = h.feed_url AND e.guid = h.guid
        ORDER BY h.hidden_at DESC LIMIT 500`);
}

export async function hiddenFeedRow(db: Db, url: string): Promise<{ reason: string | null; hidden_at: Date | string }[]> {
  return db.query<{ reason: string | null; hidden_at: Date | string }>('SELECT reason, hidden_at FROM hidden_feeds WHERE feed_url = $1', [url]);
}

export async function setHiddenFeedReason(db: Db, url: string, why: string): Promise<void> {
  await db.query('UPDATE hidden_feeds SET reason = $2 WHERE feed_url = $1', [url, why]);
}

export async function hiddenEpisodeReason(db: Db, url: string, guid: string): Promise<{ reason: string | null }[]> {
  return db.query<{ reason: string | null }>('SELECT reason FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [url, guid]);
}

/** Hides one episode everywhere with a reason; hiding it again updates the reason. */
export async function hideEpisodeWithReason(db: Db, feedUrl: string, guid: string, by: string, reason: string): Promise<Record<string, unknown>[]> {
  return db.query(
      `INSERT INTO hidden_episodes (feed_url, guid, hidden_by, reason) VALUES ($1, $2, $3, $4)
       ON CONFLICT (feed_url, guid) DO UPDATE SET reason = EXCLUDED.reason`, [feedUrl, guid, by, reason]);
}

export async function unhideEpisode(db: Db, feedUrl: string, guid: string): Promise<Record<string, unknown>[]> {
  return db.query('DELETE FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [feedUrl, guid]);
}
