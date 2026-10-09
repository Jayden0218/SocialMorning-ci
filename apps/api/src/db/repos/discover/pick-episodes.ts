// Database queries for past picks and curated issues (M26 F0: moved here from routes/discover/issues.ts).
import type { Db } from '../../db.ts';
import { notHidden } from '../studio/hidden-episodes.ts';

export type PickEpisodeRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string };
type EpRow = PickEpisodeRow;
const COLS = 'id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url';

/** One known episode: by guid, or the feed's newest (skipping a hidden one when `visibleOnly`). */
export async function pickEpisodeRows(db: Db, feedUrl: string, guid: string | undefined, visibleOnly: boolean): Promise<PickEpisodeRow[]> {
  return guid !== undefined
    ? await db.query<EpRow>(`SELECT ${COLS} FROM episodes WHERE feed_url = $1 AND guid = $2`, [feedUrl, guid])
    : await db.query<EpRow>(`SELECT ${COLS} FROM episodes WHERE feed_url = $1${visibleOnly ? ` AND ${notHidden('episodes')}` : ''} ORDER BY published_at DESC NULLS LAST, first_seen_at DESC LIMIT 1`, [feedUrl]);
}
