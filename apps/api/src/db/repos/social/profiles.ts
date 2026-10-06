// Builds a listener's profile: name, counts, stats and recent public activity.
/** A profile (M4 FR-011/FR-012/FR-013): name, counts, stats (unless private and not the viewer), recent public activity. */
import { stats } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { counts, isFollowing } from './follows.ts';
import { listenedRowsFor } from '../library/listened.ts';
import { recentBy, toFeedItem, type FeedItemOut } from './activity.ts';
import { isBlockedBy } from '../safety/blocks.ts';
import { stickerView } from '../account/stickers.ts';

export type ProfileOut = {
  id: string; displayName: string; followers: number; following: number; isFollowing: boolean;
  stats: ReturnType<typeof stats> | null; recent: FeedItemOut[];
  /** M6: set when the owner suspended this account (FR-015). */
  suspended?: boolean;
  /** M6: set when the VIEWER blocked this listener (so the app can offer Unblock). Never set the other way round (FR-008). */
  blockedByMe?: boolean;
  /** M10b US7: the country from the listener's last sign-in (two letters), shown to everyone. */
  country?: string;
  /** M19 US1: photo and bio, when set. */
  avatarUrl?: string;
  bio?: string;
  /** M21 US9: stickers placed on the header (empty while the owner hides decorations); `stickersHidden` when the owner hides their sticker library from others. */
  stickers?: import('@socialmorning/social-core').Placement[];
  stickersHidden?: true;
  /** M21 US8 (FR-074): shows this listener is a verified host of — the proven claim owner or an invited host. */
  hostOf: { feedUrl: string; title: string }[];
  /** M21 US8: how many episodes they liked — only while their likes are public, or to themselves. */
  likesCount?: number;
  /** M21 US8: their subscriptions page answers 403 `private`; the app shows that state instead of a link. */
  privateSubscriptions: boolean;
};

/**
 * M21 US8 (FR-074): the shows a listener hosts, by the same rule the show page uses for its hosts
 * (src/db/repos/studio/show-page.ts `showHosts`): the PROVEN claim owner, or an invited host in
 * `show_hosts`. A suspended listener hosts nothing (the profile is bare anyway). Title: the host's
 * override, the created show, else the newest registered episode's show title; untitled feeds are left out.
 */
export async function hostOf(db: Db, listenerId: string): Promise<{ feedUrl: string; title: string }[]> {
  const rows = await db.query<{ feed_url: string; title: string | null }>(
    `SELECT w.feed_url,
            coalesce(o.title, h.title, (SELECT e.show_title FROM episodes e WHERE e.feed_url = w.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS title
       FROM (SELECT c.feed_url, 0 AS rank, c.proven_at AS since FROM creator_claims c WHERE c.listener_id = $1 AND c.status = 'proven'
             UNION
             SELECT s.feed_url, 1, s.added_at FROM show_hosts s WHERE s.listener_id = $1) w
       JOIN listeners l ON l.id = $1 AND l.suspended_at IS NULL
       LEFT JOIN show_overrides o ON o.feed_url = w.feed_url
       LEFT JOIN hosted_shows h ON h.feed_url = w.feed_url AND h.deleted_at IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM hidden_feeds x WHERE x.feed_url = w.feed_url)
      ORDER BY w.rank, w.since`,
    [listenerId],
  );
  const seen = new Set<string>();
  const out: { feedUrl: string; title: string }[] = [];
  for (const r of rows) {
    if (!r.title || seen.has(r.feed_url)) continue;
    seen.add(r.feed_url);
    out.push({ feedUrl: r.feed_url, title: r.title });
  }
  return out;
}

/**
 * M21 US8 (G-M21-10): may `viewerId` read `id`'s subscriptions? Not when they keep them private,
 * not across a block in either direction, not when suspended. The owner always may.
 * 'none' = no such listener.
 */
export async function subscriptionsVisible(db: Db, id: string, viewerId: string | undefined): Promise<'yes' | 'private' | 'none'> {
  const [l] = await db.query<{ private_subscriptions: boolean; suspended_at: string | null }>('SELECT private_subscriptions, suspended_at FROM listeners WHERE id = $1', [id]);
  if (!l || l.suspended_at) return 'none';
  if (viewerId === id) return 'yes';
  if (l.private_subscriptions) return 'private';
  if (viewerId && ((await isBlockedBy(db, id, viewerId)) || (await isBlockedBy(db, viewerId, id)))) return 'private';
  return 'yes';
}

export async function profile(db: Db, id: string, viewerId: string | undefined, today: string): Promise<ProfileOut | undefined> {
  // M21 US8 (G-M21-10): birthday and industry are never selected here — this answer goes to anyone.
  const [l] = await db.query<{ id: string; display_name: string; private_listening: boolean; suspended_at: string | null; country: string | null; avatar_url: string | null; bio: string | null; likes_public: boolean; private_subscriptions: boolean }>('SELECT id, display_name, private_listening, suspended_at, country, avatar_url, bio, likes_public, private_subscriptions, industry FROM listeners WHERE id = $1', [id]);
  if (!l) return undefined;
  // M6 (FR-008, FR-015): to someone they blocked, a listener looks private and quiet — name only, no hint why. A suspended account shows as suspended.
  // M19 US1: photo and bio travel with the name; age range and gender never do (FR-003).
  const look = { ...(l.avatar_url ? { avatarUrl: l.avatar_url } : {}), ...(l.bio ? { bio: l.bio } : {}), ...((l as { industry?: string }).industry ? { industry: (l as { industry?: string }).industry } : {}) }; // RED CHECK G-M21-10
  const bare = { id: l.id, displayName: l.display_name, ...look, followers: 0, following: 0, isFollowing: false, stats: null, recent: [], hostOf: [], privateSubscriptions: true };
  if (l.suspended_at) return { ...bare, suspended: true };
  if (viewerId && viewerId !== id && (await isBlockedBy(db, id, viewerId))) return bare;
  const blockedByMe = viewerId && viewerId !== id ? await isBlockedBy(db, viewerId, id) : false;
  // M16a bug 2: counted with the same rule the follower/following lists use for this viewer.
  const c = await counts(db, id, viewerId);
  const following = viewerId ? await isFollowing(db, viewerId, id) : false;
  const showStats = !l.private_listening || viewerId === id;
  const s = showStats ? stats(await listenedRowsFor(db, id), today) : null;
  const recent = (await recentBy(db, id)).map(toFeedItem);
  // M21 US8: the likes count follows the likes page's own rule (public, or yourself).
  let likesCount: number | undefined;
  if (l.likes_public || viewerId === id) {
    const [n] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM episode_likes WHERE listener_id = $1', [id]);
    likesCount = Number(n?.n ?? 0);
  }
  const m21 = { hostOf: await hostOf(db, id), ...(likesCount !== undefined ? { likesCount } : {}), privateSubscriptions: viewerId === id ? false : l.private_subscriptions };
  const deco = await stickerView(db, id, viewerId); // M21 US9
  return { ...deco, id: l.id, displayName: l.display_name, ...look, followers: c.followers, following: c.following, isFollowing: following, stats: s, recent, ...m21, ...(blockedByMe ? { blockedByMe: true } : {}), ...(l.country ? { country: l.country.trim() } : {}) };
}

export async function setPrivateListening(db: Db, id: string, value: boolean): Promise<void> {
  await db.query('UPDATE listeners SET private_listening = $2 WHERE id = $1', [id, value]);
}
