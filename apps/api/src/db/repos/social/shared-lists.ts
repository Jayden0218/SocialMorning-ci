// Database queries for shared show lists (M22 US17 item 5; moved from routes/lists.ts in M26 F0-01).
import type { Db } from '../../db.ts';

export type SharedListRow = { id: string; title: string; feed_urls: string[] | string; created_at: Date | string; owner_id: string; display_name: string; suspended_at: string | null };
export type SharedListShowRow = { feed_url: string; title: string | null; image_url: string | null };

export async function sharedListRows(db: Db, id: string): Promise<SharedListRow[]> {
  return db.query<SharedListRow>(
    `SELECT s.id, s.title, s.feed_urls, s.created_at, s.owner_id, l.display_name, l.suspended_at
       FROM shared_lists s JOIN listeners l ON l.id = s.owner_id WHERE s.id = $1 AND s.removed_at IS NULL`, [id]); // M24 US1: removed by the admin
}

/** The shows of a list, in list order; a show hidden by moderation is left out. */
export async function sharedListShowRows(db: Db, urls: string[]): Promise<SharedListShowRow[]> {
  return db.query<SharedListShowRow>(
    `SELECT u.feed_url,
            coalesce(o.title, (SELECT e.show_title FROM episodes e WHERE e.feed_url = u.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS title,
            coalesce(o.cover_url, (SELECT e.image_url FROM episodes e WHERE e.feed_url = u.feed_url AND e.image_url IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS image_url
       FROM unnest($1::text[]) WITH ORDINALITY AS u(feed_url, pos)
       LEFT JOIN show_overrides o ON o.feed_url = u.feed_url
      WHERE NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = u.feed_url)
      ORDER BY u.pos`, [urls]);
}

/** Returns the id when inserted, nothing on an id clash. */
export async function insertSharedList(db: Db, id: string, ownerId: string, title: string, feedUrls: string[]): Promise<{ id: string }[]> {
  return db.query<{ id: string }>(
    'INSERT INTO shared_lists (id, owner_id, title, feed_urls) VALUES ($1, $2, $3, $4::text[]) ON CONFLICT (id) DO NOTHING RETURNING id',
    [id, ownerId, title, feedUrls]);
}
