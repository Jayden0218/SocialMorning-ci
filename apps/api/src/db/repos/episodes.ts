import type { Db } from '../db.ts';

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
};

/**
 * Client-registered episode (research R6). Insert, or refresh `title` and fill a NULL
 * `duration_ms`. A known duration is never overwritten by a later report: the heat
 * buckets were computed against it (FR-021).
 */
export async function upsertEpisode(db: Db, e: EpisodeInput): Promise<EpisodeRow> {
  const rows = await db.query<EpisodeRow>(
    `INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at, genre_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       show_title = COALESCE(EXCLUDED.show_title, episodes.show_title),
       image_url = COALESCE(EXCLUDED.image_url, episodes.image_url),
       duration_ms = COALESCE(episodes.duration_ms, EXCLUDED.duration_ms),
       published_at = COALESCE(EXCLUDED.published_at, episodes.published_at),
       genre_id = COALESCE(EXCLUDED.genre_id, episodes.genre_id),
       updated_at = CASE WHEN episodes.duration_ms IS NULL AND EXCLUDED.duration_ms IS NOT NULL THEN now() ELSE episodes.updated_at END
     RETURNING id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at, genre_id`,
    [e.id, e.feedUrl, e.guid, e.title, e.showTitle ?? null, e.enclosureUrl, e.imageUrl ?? null, e.durationMs ?? null, e.publishedAt ?? null, e.genreId ?? null],
  );
  return rows[0]!;
}

export async function getEpisode(db: Db, id: string): Promise<EpisodeRow | undefined> {
  const rows = await db.query<EpisodeRow>(
    'SELECT id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at, genre_id FROM episodes WHERE id = $1',
    [id],
  );
  return rows[0];
}

/** True when this call turned a NULL duration into a known one (the heat rebuild trigger, FR-021). */
export async function durationBecameKnown(before: EpisodeRow | undefined, after: EpisodeRow): Promise<boolean> {
  return (before?.duration_ms ?? null) === null && after.duration_ms !== null;
}
