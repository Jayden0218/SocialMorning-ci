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

// M26 lane ST: hidden episodes are lane ST's (studio/hidden-episodes.ts, on DynamoDB with the Store).
export { hiddenEpisodeRows, hiddenEpisodeReason, hideEpisodeWithReason, unhideEpisode } from '../studio/hidden-episodes.ts';

export async function hiddenFeedRow(db: Db, url: string): Promise<{ reason: string | null; hidden_at: Date | string }[]> {
  return db.query<{ reason: string | null; hidden_at: Date | string }>('SELECT reason, hidden_at FROM hidden_feeds WHERE feed_url = $1', [url]);
}

export async function setHiddenFeedReason(db: Db, url: string, why: string): Promise<void> {
  await db.query('UPDATE hidden_feeds SET reason = $2 WHERE feed_url = $1', [url, why]);
}

