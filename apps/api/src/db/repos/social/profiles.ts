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
  /** M22 US17 item 6: the ≤ 6 shows listened to most in the last 90 days; empty when hidden (or private) and not yourself. */
  oftenListened: OftenListenedShow[];
  /** M22 US17: only on your own profile — whether others see the row (Privacy switch). */
  hideOftenListened?: boolean;
};

export type OftenListenedShow = { feedUrl: string; title: string; imageUrl: string | null; listenedMs: number };

export const OFTEN_LISTENED_DAYS = 90;
export const OFTEN_LISTENED_MAX = 6;

/** M22 US17 item 6: the shows `id` listened to most in the last 90 days (by listened time), with title and artwork. */
export async function oftenListened(db: Db, id: string, today: string): Promise<OftenListenedShow[]> {
  const cutoff = new Date(new Date(`${today}T00:00:00Z`).getTime() - (OFTEN_LISTENED_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = (await listenedRowsFor(db, id)).filter((r) => r.day >= cutoff);
  const top = stats(rows, today, OFTEN_LISTENED_MAX).all.topShows;
  if (top.length === 0) return [];
  const meta = await db.query<{ feed_url: string; title: string | null; image_url: string | null }>(
    `SELECT u.feed_url,
            coalesce(o.title, (SELECT e.show_title FROM episodes e WHERE e.feed_url = u.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS title,
            coalesce(o.cover_url, (SELECT e.image_url FROM episodes e WHERE e.feed_url = u.feed_url AND e.image_url IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS image_url
       FROM unnest($1::text[]) AS u(feed_url)
       LEFT JOIN show_overrides o ON o.feed_url = u.feed_url
      WHERE NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = u.feed_url)`,
    [top.map((t) => t.feedUrl)]);
  const byUrl = new Map(meta.map((m) => [m.feed_url, m]));
  const out: OftenListenedShow[] = [];
  for (const t of top) {
    const m = byUrl.get(t.feedUrl);
    if (!m) continue; // hidden by moderation
    const title = m.title ?? t.showTitle;
    if (!title) continue;
    out.push({ feedUrl: t.feedUrl, title, imageUrl: m.image_url, listenedMs: t.listenedMs });
  }
  return out;
}

export async function setHideOftenListened(db: Db, id: string, value: boolean): Promise<void> {
  await db.query('UPDATE listeners SET hide_often_listened = $2 WHERE id = $1', [id, value]);
}

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
       JOIN listeners l ON l.id = $1 AND l.suspended_at IS NULL AND l.hidden_at IS NULL
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
  const [l] = await db.query<{ private_subscriptions: boolean; suspended_at: string | null; hidden_at: string | null }>('SELECT private_subscriptions, suspended_at, hidden_at FROM listeners WHERE id = $1', [id]);
  if (!l || l.suspended_at) return 'none';
  // M22 US11 (G-M22-8): an account waiting to be deleted is invisible to everyone else.
  if (l.hidden_at && viewerId !== id) return 'none';
  if (viewerId === id) return 'yes';
  if (l.private_subscriptions) return 'private';
  if (viewerId && ((await isBlockedBy(db, id, viewerId)) || (await isBlockedBy(db, viewerId, id)))) return 'private';
  return 'yes';
}

export async function profile(db: Db, id: string, viewerId: string | undefined, today: string): Promise<ProfileOut | undefined> {
  // M21 US8 (G-M21-10): birthday and industry are never selected here — this answer goes to anyone.
  const [l] = await db.query<{ id: string; display_name: string; private_listening: boolean; suspended_at: string | null; hidden_at: string | null; country: string | null; avatar_url: string | null; bio: string | null; likes_public: boolean; private_subscriptions: boolean; hide_often_listened: boolean }>('SELECT id, display_name, private_listening, suspended_at, hidden_at, country, avatar_url, bio, likes_public, private_subscriptions, hide_often_listened FROM listeners WHERE id = $1', [id]);
  if (!l) return undefined;
  // M22 US11 (G-M22-8): an account waiting to be deleted reads as "no such listener" to others.
  if (l.hidden_at && viewerId !== id) return undefined;
  // M6 (FR-008, FR-015): to someone they blocked, a listener looks private and quiet — name only, no hint why. A suspended account shows as suspended.
  // M19 US1: photo and bio travel with the name; age range and gender never do (FR-003).
  const look = { ...(l.avatar_url ? { avatarUrl: l.avatar_url } : {}), ...(l.bio ? { bio: l.bio } : {}) };
  const bare = { id: l.id, displayName: l.display_name, ...look, followers: 0, following: 0, isFollowing: false, stats: null, recent: [], hostOf: [], privateSubscriptions: true, oftenListened: [] };
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
  // M22 US17 item 6: hidden by the switch, or by private listening, from everyone but themselves.
  const self = viewerId === id;
  const often = self || (!l.hide_often_listened && !l.private_listening) ? await oftenListened(db, id, today) : [];
  const m22 = { oftenListened: often, ...(self ? { hideOftenListened: l.hide_often_listened } : {}) };
  return { ...deco, ...m22, id: l.id, displayName: l.display_name, ...look, followers: c.followers, following: c.following, isFollowing: following, stats: s, recent, ...m21, ...(blockedByMe ? { blockedByMe: true } : {}), ...(l.country ? { country: l.country.trim() } : {}) };
}

export async function setPrivateListening(db: Db, id: string, value: boolean): Promise<void> {
  await db.query('UPDATE listeners SET private_listening = $2 WHERE id = $1', [id, value]);
}
