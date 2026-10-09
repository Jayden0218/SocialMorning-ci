// What the app's show page reads from us: subscribers, hosts with faces, host picks, owner info.
/**
 * M21 US5 (FR-040…FR-042, contracts/api.md "Episode and show"). The show page draws from the
 * RSS feed on the phone; these are the parts only the server knows.
 *
 * - `subscriberCount`: our own count — live `subscriptions` rows (`deleted_at IS NULL`, the
 *   tombstone rule of migration 005); 0 for a feed moderation has hidden.
 * - `showHosts`: the verified owner (the PROVEN claim) first, then the invited hosts
 *   (`show_hosts`), each with a face; suspended accounts are left out.
 * - Host picks: up to 20 of the show's episodes, in the host's order (`host_picks`, migration 019).
 * - `showInfo`: who stands behind the show — created in the Studio, claimed, or only a feed —
 *   and the owner's country (two letters, guard G-I1), never more.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

import { HOST_PICKS_MAX } from '@socialmorning/social-core';
export { HOST_PICKS_MAX };

export async function subscriberCount(db: Db, feedUrl: string): Promise<number> {
  const [r] = await db.query<{ n: number | string; hidden: boolean }>(
    `SELECT (SELECT count(*) FROM subscriptions WHERE feed_url = $1 AND deleted_at IS NULL) AS n,
            EXISTS (SELECT 1 FROM hidden_feeds WHERE feed_url = $1) AS hidden`, [feedUrl]);
  return r && !r.hidden ? Number(r.n) : 0;
}

export type ShowHost = { id: string; name: string; avatarUrl: string | null };

export async function showHosts(db: Db, feedUrl: string): Promise<ShowHost[]> {
  const rows = await db.query<{ id: string; display_name: string; avatar_url: string | null }>(
    `SELECT l.id, l.display_name, l.avatar_url FROM (
        SELECT c.listener_id, 0 AS rank, c.proven_at AS since FROM creator_claims c WHERE c.feed_url = $1 AND c.status = 'proven'
        UNION ALL
        SELECT h.listener_id, 1, h.added_at FROM show_hosts h WHERE h.feed_url = $1
     ) w JOIN listeners l ON l.id = w.listener_id
      WHERE l.suspended_at IS NULL AND l.hidden_at IS NULL
      ORDER BY w.rank, w.since`, [feedUrl]);
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))).map((r) => ({ id: r.id, name: r.display_name, avatarUrl: r.avatar_url }));
}

export async function hostPicks(db: Db, feedUrl: string): Promise<string[]> {
  // M24 US11: a hidden episode is no longer a pick.
  const rows = await db.query<{ episode_id: string }>(
    `SELECT p.episode_id FROM host_picks p WHERE p.feed_url = $1
       AND NOT EXISTS (SELECT 1 FROM episodes e JOIN hidden_episodes h ON h.feed_url = e.feed_url AND h.guid = e.guid WHERE e.id = p.episode_id)
     ORDER BY p.position`, [feedUrl]);
  return rows.map((r) => r.episode_id);
}

/** Replaces the show's picks with `episodeIds`, in that order. Every id must be an episode of this show. */
export async function setHostPicks(db: Db, feedUrl: string, episodeIds: readonly string[], by: string): Promise<string[]> {
  const ids = [...new Set(episodeIds)];
  if (ids.length > HOST_PICKS_MAX) throw new ApiError('validation', `At most ${HOST_PICKS_MAX} host picks.`, { fields: ['episodeIds'] });
  return db.transaction(async (tx) => {
    if (ids.length > 0) {
      const found = await tx.query<{ id: string }>('SELECT id FROM episodes WHERE feed_url = $1 AND id = ANY($2::text[])', [feedUrl, ids]);
      if (found.length !== ids.length) throw new ApiError('validation', 'Pick episodes of this show only.', { fields: ['episodeIds'] });
    }
    await tx.query('DELETE FROM host_picks WHERE feed_url = $1', [feedUrl]);
    for (const [i, id] of ids.entries()) {
      await tx.query('INSERT INTO host_picks (feed_url, episode_id, position, picked_by) VALUES ($1, $2, $3, $4)', [feedUrl, id, i + 1, by]);
    }
    return ids;
  });
}

/** The picks with their titles, for the Studio. */
export async function hostPickItems(db: Db, feedUrl: string): Promise<{ id: string; title: string }[]> {
  return db.query<{ id: string; title: string }>(
    'SELECT e.id, e.title FROM host_picks p JOIN episodes e ON e.id = p.episode_id WHERE p.feed_url = $1 ORDER BY p.position', [feedUrl]);
}

export type ShowInfo = { ownerType: 'claimed' | 'studio' | 'feed'; ownerCountry: string | null; feedUrl: string; claimedAt: string | null };

export async function showInfo(db: Db, feedUrl: string): Promise<ShowInfo> {
  const [r] = await db.query<{ proven_at: Date | string | null; country: string | null; hosted: boolean }>(
    `SELECT c.proven_at, l.country,
            EXISTS (SELECT 1 FROM hosted_shows h WHERE h.feed_url = $1 AND h.deleted_at IS NULL) AS hosted
       FROM creator_claims c JOIN listeners l ON l.id = c.listener_id
      WHERE c.feed_url = $1 AND c.status = 'proven'`, [feedUrl]);
  if (!r) return { ownerType: 'feed', ownerCountry: null, feedUrl, claimedAt: null };
  const country = r.country && /^[A-Za-z]{2}$/.test(r.country.trim()) ? r.country.trim().toUpperCase() : null;
  return {
    ownerType: r.hosted ? 'studio' : 'claimed',
    ownerCountry: country,
    feedUrl,
    claimedAt: r.proven_at ? new Date(r.proven_at).toISOString() : null,
  };
}

export type ShowPageAnnouncementRow = { id: string; body: string; created_at: Date | string; edited_at: Date | string | null; images: unknown };

/** The show page's three newest released announcements. */
export async function latestAnnouncementRows(db: Db, feedUrl: string): Promise<ShowPageAnnouncementRow[]> {
  return db.query<{ id: string; body: string; created_at: Date | string; edited_at: Date | string | null; images: unknown }>(
      'SELECT id, body, created_at, edited_at, images FROM announcements WHERE feed_url = $1 AND deleted_at IS NULL AND release_at <= now() ORDER BY created_at DESC LIMIT 3', [feedUrl]);
}

/** The newest episode image of a feed (the show page's last-resort cover). */
export async function newestEpisodeImageRows(db: Db, feedUrl: string): Promise<{ image_url: string }[]> {
  return db.query<{ image_url: string }>('SELECT image_url FROM episodes WHERE feed_url = $1 AND image_url IS NOT NULL ORDER BY published_at DESC NULLS LAST LIMIT 1', [feedUrl]);
}
