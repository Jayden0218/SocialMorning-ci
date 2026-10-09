// Database queries for pushing the day's pick (M26: moved here from routes/internal.ts).
import type { Db } from '../../db.ts';

/** The pick's episode: the named guid, or the feed's newest when the pick names none. */
export async function pickEpisodeRows(db: Db, p: { feedUrl: string; guid?: string | undefined }): Promise<{ id: string; title: string }[]> {
  return db.query<{ id: string; title: string }>(
            p.guid !== undefined ? 'SELECT id, title FROM episodes WHERE feed_url = $1 AND guid = $2' : 'SELECT id, title FROM episodes WHERE feed_url = $1 ORDER BY published_at DESC NULLS LAST LIMIT 1',
            p.guid !== undefined ? [p.feedUrl, p.guid] : [p.feedUrl]);
}

/** One row when the episode is hidden by its show (M24 US11). */
export async function hiddenEpisodeRows(db: Db, episodeId: string): Promise<Record<string, unknown>[]> {
  return db.query('SELECT 1 FROM episodes e JOIN hidden_episodes h ON h.feed_url = e.feed_url AND h.guid = e.guid WHERE e.id = $1', [episodeId]);
}
