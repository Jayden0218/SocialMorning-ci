// Builds a listener's profile: name, counts, stats and recent public activity.
/** A profile (M4 FR-011/FR-012/FR-013): name, counts, stats (unless private and not the viewer), recent public activity. */
import { stats } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { counts, isFollowing } from './follows.ts';
import { listenedRowsFor } from '../library/listened.ts';
import { recentBy, toFeedItem, type FeedItemOut } from './activity.ts';
import { isBlockedBy } from '../safety/blocks.ts';

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
};

export async function profile(db: Db, id: string, viewerId: string | undefined, today: string): Promise<ProfileOut | undefined> {
  const [l] = await db.query<{ id: string; display_name: string; private_listening: boolean; suspended_at: string | null; country: string | null; avatar_url: string | null; bio: string | null }>('SELECT id, display_name, private_listening, suspended_at, country, avatar_url, bio FROM listeners WHERE id = $1', [id]);
  if (!l) return undefined;
  // M6 (FR-008, FR-015): to someone they blocked, a listener looks private and quiet — name only, no hint why. A suspended account shows as suspended.
  // M19 US1: photo and bio travel with the name; age range and gender never do (FR-003).
  const look = { ...(l.avatar_url ? { avatarUrl: l.avatar_url } : {}), ...(l.bio ? { bio: l.bio } : {}) };
  const bare = { id: l.id, displayName: l.display_name, ...look, followers: 0, following: 0, isFollowing: false, stats: null, recent: [] };
  if (l.suspended_at) return { ...bare, suspended: true };
  if (viewerId && viewerId !== id && (await isBlockedBy(db, id, viewerId))) return bare;
  const blockedByMe = viewerId && viewerId !== id ? await isBlockedBy(db, viewerId, id) : false;
  // M16a bug 2: counted with the same rule the follower/following lists use for this viewer.
  const c = await counts(db, id, viewerId);
  const following = viewerId ? await isFollowing(db, viewerId, id) : false;
  const showStats = !l.private_listening || viewerId === id;
  const s = showStats ? stats(await listenedRowsFor(db, id), today) : null;
  const recent = (await recentBy(db, id)).map(toFeedItem);
  return { id: l.id, displayName: l.display_name, ...look, followers: c.followers, following: c.following, isFollowing: following, stats: s, recent, ...(blockedByMe ? { blockedByMe: true } : {}), ...(l.country ? { country: l.country.trim() } : {}) };
}

export async function setPrivateListening(db: Db, id: string, value: boolean): Promise<void> {
  await db.query('UPDATE listeners SET private_listening = $2 WHERE id = $1', [id, value]);
}
