// Database queries for search: Studio-created shows and people (M26 F0: moved here from routes/discover/search.ts).
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export type CreatedShowRow = { feed_url: string; title: string; author: string; cover_url: string | null; category: string };

/** Live shows created in the Studio whose title contains the (already LIKE-escaped) term, newest first. */
async function createdShowsMatchingPg(db: Db, escaped: string): Promise<CreatedShowRow[]> {
  return db.query<{ feed_url: string; title: string; author: string; cover_url: string | null; category: string }>(
    `SELECT feed_url, title, author, cover_url, category FROM hosted_shows
      WHERE deleted_at IS NULL AND title ILIKE '%' || $1 || '%' ORDER BY created_at DESC LIMIT 10`,
    [escaped],
  );
}

/** Listeners whose display name contains the (already LIKE-escaped) term, blocks hidden both ways. */
async function peopleMatchingPg(db: Db, like: string, viewer: string | null): Promise<{ id: string; display_name: string }[]> {
  return db.query<{ id: string; display_name: string }>(
      `SELECT l.id, l.display_name FROM listeners l
        WHERE l.suspended_at IS NULL AND l.hidden_at IS NULL AND l.display_name ILIKE '%' || $1 || '%'
          AND ($2::uuid IS NULL OR (l.id <> $2::uuid AND NOT EXISTS (
            SELECT 1 FROM blocks b WHERE (b.blocker_id = l.id AND b.blocked_id = $2::uuid) OR (b.blocker_id = $2::uuid AND b.blocked_id = l.id))))
        ORDER BY (l.display_name ILIKE $1 || '%') DESC, lower(l.display_name), l.id LIMIT 20`,
      [like, viewer],
    );
}

// M26 lane DV: each runs on Postgres, or on DynamoDB (ddb/search-local.ts) when the Db carries a Store (db/backend.ts).
export const createdShowsMatching = dual('dv/search-local', 'createdShowsMatching', createdShowsMatchingPg);
export const peopleMatching = dual('dv/search-local', 'peopleMatching', peopleMatchingPg);
