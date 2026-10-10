// Database queries for known episodes: by (feed, guid), a feed's newest, or by id (M26 F0: moved here from routes/discover/issues.ts).
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import { notHidden } from '../studio/hidden-episodes.ts';

export type PickEpisodeRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at?: Date | string | null };
type EpRow = PickEpisodeRow;
const COLS = 'id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url, published_at';

/** One known episode: by guid, or the feed's newest (skipping a hidden one when `visibleOnly`). */
async function pickEpisodeRowsPg(db: Db, feedUrl: string, guid: string | undefined, visibleOnly: boolean): Promise<PickEpisodeRow[]> {
  return guid !== undefined
    ? await db.query<EpRow>(`SELECT ${COLS} FROM episodes WHERE feed_url = $1 AND guid = $2`, [feedUrl, guid])
    : await db.query<EpRow>(`SELECT ${COLS} FROM episodes WHERE feed_url = $1${visibleOnly ? ` AND ${notHidden('episodes')}` : ''} ORDER BY published_at DESC NULLS LAST, first_seen_at DESC LIMIT 1`, [feedUrl]);
}

/** An episode row as the Discover lists read it (any number of ids; unknown ids are left out, no order). */
export type EpisodeCardRow = PickEpisodeRow & { published_at: Date | string | null; genre_id: number | null; media_kind: string | null };

async function episodeRowsByIdsPg(db: Db, ids: readonly string[]): Promise<EpisodeCardRow[]> {
  if (ids.length === 0) return [];
  return db.query<EpisodeCardRow>(`SELECT ${COLS}, genre_id, media_kind FROM episodes WHERE id = ANY($1::text[])`, [[...new Set(ids)]]);
}

// M26 lane DV: each runs on Postgres, or on DynamoDB (ddb/pick-episodes.ts) when the Db carries a Store (db/backend.ts).
export const pickEpisodeRows = dual('dv/pick-episodes', 'pickEpisodeRows', pickEpisodeRowsPg);
export const episodeRowsByIds = dual('dv/pick-episodes', 'episodeRowsByIds', episodeRowsByIdsPg);
