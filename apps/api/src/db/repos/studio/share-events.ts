// Database queries for share events (M26 F0: moved here from routes/creators/extras.ts).
import type { Db } from '../../db.ts';

/** Shares the listener recorded in the last minute. */
export async function recentShareCountRows(db: Db, listenerId: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>("SELECT count(*)::int AS n FROM share_events WHERE listener_id = $1 AND at > now() - interval '1 minute'", [listenerId]);
}

/** Record that a share sheet opened. */
export async function insertShareEvent(db: Db, listenerId: string | null, targetKind: string, targetId: string, feedUrl: string): Promise<void> {
  await db.query('INSERT INTO share_events (listener_id, target_kind, target_id, feed_url) VALUES ($1, $2, $3, $4)', [listenerId, targetKind, targetId, feedUrl]);
}
