// Decides who may manage which show in the Studio: owner or helper.
/**
 * M11 — who may use the Studio for which show (specs/011-m11-studio/data-model.md).
 * The owner is the PROVEN claim (M10b); operators are `show_members`, and only count while
 * the show still has a proven owner. A show is addressed in URLs by `fnv1a64(feed_url)`, so
 * no feed URL (with its slashes) ever travels through the Studio's proxy as a path segment.
 */
import { fnv1a64 } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export type Role = 'owner' | 'operator';
export type StudioShow = { key: string; feedUrl: string; title: string | null; image: string | null; role: Role; hosted: boolean };

export const showKey = (feedUrl: string): string => fnv1a64(feedUrl);

async function showsForPg(db: Db, listenerId: string): Promise<StudioShow[]> {
  const rows = await db.query<{ feed_url: string; role: Role; title: string | null; image: string | null; hosted: boolean | null }>(
    `WITH mine AS (
       SELECT feed_url, 'owner' AS role, proven_at AS since FROM creator_claims
        WHERE listener_id = $1 AND status = 'proven'
       UNION ALL
       SELECT m.feed_url, 'operator', m.created_at FROM show_members m
        WHERE m.listener_id = $1
          AND EXISTS (SELECT 1 FROM creator_claims c WHERE c.feed_url = m.feed_url AND c.status = 'proven')
     )
     SELECT mine.feed_url, mine.role,
            (SELECT h.id IS NOT NULL FROM hosted_shows h WHERE h.feed_url = mine.feed_url AND h.deleted_at IS NULL) AS hosted,
            coalesce((SELECT h.title FROM hosted_shows h WHERE h.feed_url = mine.feed_url AND h.deleted_at IS NULL),
            (SELECT coalesce(e.show_title, e.title) FROM episodes e WHERE e.feed_url = mine.feed_url
              ORDER BY e.published_at DESC NULLS LAST, e.first_seen_at DESC LIMIT 1)) AS title,
            coalesce((SELECT h.cover_url FROM hosted_shows h WHERE h.feed_url = mine.feed_url AND h.deleted_at IS NULL),
            (SELECT e.image_url FROM episodes e WHERE e.feed_url = mine.feed_url AND e.image_url IS NOT NULL
              ORDER BY e.published_at DESC NULLS LAST, e.first_seen_at DESC LIMIT 1)) AS image
       FROM mine ORDER BY mine.role DESC, mine.since`,
    [listenerId],
  );
  return rows.map((r) => ({ key: showKey(r.feed_url), feedUrl: r.feed_url, title: r.title, image: r.image, role: r.role, hosted: r.hosted === true }));
}

/** The caller's role on the show with this key, or null. Checked on every Studio request (guard G-A1). */
async function roleForPg(db: Db, listenerId: string, key: string): Promise<StudioShow | null> {
  return (await showsForPg(db, listenerId)).find((s) => s.key === key) ?? null;
}

// M26 lane ST: each runs on Postgres, or on DynamoDB (ddb/roles.ts — the `ROLES#` copies) when the Db carries a Store.
export const showsFor = dual('st/roles', 'showsFor', showsForPg);
export const roleFor = dual('st/roles', 'roleFor', roleForPg);
