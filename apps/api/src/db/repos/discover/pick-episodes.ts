// Database queries for known episodes: by (feed, guid), a feed's newest, or by id (M26 F0: moved here from routes/discover/issues.ts).
import { viaStore } from '../../backend.ts';

export type PickEpisodeRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string; published_at?: Date | string | null };

/** An episode row as the Discover lists read it (any number of ids; unknown ids are left out, no order). */
export type EpisodeCardRow = PickEpisodeRow & { published_at: Date | string | null; genre_id: number | null; media_kind: string | null };

// Each runs its DynamoDB body (ddb/pick-episodes.ts) on the Store the Db carries (db/backend.ts).
export const pickEpisodeRows = viaStore<typeof import('./ddb/pick-episodes.ts').pickEpisodeRows>('dv/pick-episodes', 'pickEpisodeRows');
export const episodeRowsByIds = viaStore<typeof import('./ddb/pick-episodes.ts').episodeRowsByIds>('dv/pick-episodes', 'episodeRowsByIds');
