// Reads for the public pages and share routes: the share card's fallback artwork, an episode check, the show card, the cached feed.
import type { Db } from '../../db.ts';
import { notHidden } from '../studio/hidden-episodes.ts';

/** Any artwork from the same show, for an episode without its own. */
export async function showImageRows(db: Db, feedUrl: string): Promise<{ image_url: string }[]> {
  return db.query<{ image_url: string }>('SELECT image_url FROM episodes WHERE feed_url = $1 AND image_url IS NOT NULL LIMIT 1', [feedUrl]);
}

/** One row when the episode is on the server. */
export async function episodeIdRows(db: Db, id: string): Promise<{ id: string }[]> {
  return db.query<{ id: string }>('SELECT id FROM episodes WHERE id = $1', [id]);
}

/** Every feed with a proven claim. */
export async function provenFeedRows(db: Db): Promise<{ feed_url: string }[]> {
  return db.query<{ feed_url: string }>("SELECT DISTINCT feed_url FROM creator_claims WHERE status = 'proven'");
}

export type ShowCardInfo = { title: string | null; description: string | null; cover: string | null };

/** The show card's title, description and cover: the owner's override, the hosted show, then the episodes. */
export async function showCardInfoRows(db: Db, feedUrl: string): Promise<ShowCardInfo[]> {
  return db.query<{ title: string | null; description: string | null; cover: string | null }>(
    `SELECT coalesce(o.title, h.title, (SELECT coalesce(e.show_title, e.title) FROM episodes e WHERE e.feed_url = $1 ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS title,
            coalesce(o.description, h.description) AS description,
            coalesce(o.cover_url, h.cover_url, (SELECT e.image_url FROM episodes e WHERE e.feed_url = $1 AND e.image_url IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS cover
       FROM (SELECT 1) one LEFT JOIN show_overrides o ON o.feed_url = $1 LEFT JOIN hosted_shows h ON h.feed_url = $1 AND h.deleted_at IS NULL`, [feedUrl]);
}

/** The show card's latest 5 published, not hidden episodes. */
export async function showCardEpisodeRows(db: Db, feedUrl: string): Promise<{ title: string; published_at: Date | string | null }[]> {
  // M24 US11: hidden episodes leave this list.
  return db.query<{ title: string; published_at: Date | string | null }>(
    `SELECT title, published_at FROM episodes e WHERE e.feed_url = $1 AND (e.published_at IS NULL OR e.published_at <= now()) AND ${notHidden('e')} ORDER BY e.published_at DESC NULLS LAST LIMIT 5`, [feedUrl]);
}

/** The server's cached copy of a feed (`feed:<url>`), as stored. */
export async function cachedFeedRows(db: Db, feedUrl: string): Promise<{ body: unknown }[]> {
  return db.query<{ body: unknown }>('SELECT body FROM cache WHERE key = $1', [`feed:${feedUrl}`]);
}
