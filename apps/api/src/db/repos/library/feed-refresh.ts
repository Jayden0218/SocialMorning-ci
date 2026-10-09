// Database queries for the hourly feed refresh (M26: moved here from routes/internal.ts).
import type { Db } from '../../db.ts';

/** Subscribed feeds refreshed per `feeds` call (re-exported by routes/internal.ts). */
export const FEEDS_PER_CALL = 25;

/** One page of the distinct subscribed feeds (one extra row says whether more follow). */
export async function subscribedFeedPage(db: Db, offset: number): Promise<{ feed_url: string }[]> {
  return db.query<{ feed_url: string }>(
        `SELECT DISTINCT feed_url FROM subscriptions WHERE deleted_at IS NULL
         ORDER BY feed_url LIMIT ${FEEDS_PER_CALL + 1} OFFSET $1`, [offset]);
}

/** Which of these guids the server already has for the feed. */
export async function knownGuidRows(db: Db, feedUrl: string, guids: string[]): Promise<{ guid: string }[]> {
  return db.query<{ guid: string }>('SELECT guid FROM episodes WHERE feed_url = $1 AND guid = ANY($2::text[])', [feedUrl, guids]);
}
