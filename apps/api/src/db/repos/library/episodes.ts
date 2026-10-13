// Saves and reads episodes the app registers; a known duration is never overwritten.
import { viaStore } from '../../backend.ts';

export type EpisodeRow = {
  id: string;
  feed_url: string;
  guid: string;
  title: string;
  show_title: string | null;
  enclosure_url: string;
  image_url: string | null;
  duration_ms: number | null;
  published_at: string | null;
  genre_id: number | null;
};

export type EpisodeInput = {
  id: string;
  feedUrl: string;
  guid: string;
  title: string;
  showTitle?: string;
  enclosureUrl: string;
  imageUrl?: string;
  durationMs?: number;
  /** The PUBLISHER's date, ISO-8601. Absent stays NULL — never `now()` (M8, guard G-F1). */
  publishedAt?: string;
  /** Apple genre id for the show this episode belongs to (M8, catalog/genres.ts). */
  genreId?: number;
  /** M10b US5: 'video' when the feed says so; absent keeps what is stored (default audio). */
  mediaKind?: 'video';
};

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const upsertEpisode = viaStore<typeof import('./ddb/episodes.ts').upsertEpisode>('lb/episodes', 'upsertEpisode');
export const fillEpisode = viaStore<typeof import('./ddb/episodes.ts').fillEpisode>('lb/episodes', 'fillEpisode');
export const getEpisode = viaStore<typeof import('./ddb/episodes.ts').getEpisode>('lb/episodes', 'getEpisode');
export const registerEpisodeTx = viaStore<typeof import('./ddb/episodes.ts').registerEpisodeTx>('lb/episodes', 'registerEpisodeTx');
