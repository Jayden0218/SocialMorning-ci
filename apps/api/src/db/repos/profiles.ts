/** A profile (M4 FR-011/FR-012/FR-013): name, counts, stats (unless private and not the viewer), recent public activity. */
import { stats } from '@socialmorning/social-core';
import type { Db } from '../db.ts';
import { counts, isFollowing } from './follows.ts';
import { listenedRowsFor } from './listened.ts';
import { recentBy, toFeedItem, type FeedItemOut } from './activity.ts';

export type ProfileOut = {
  id: string; displayName: string; followers: number; following: number; isFollowing: boolean;
  stats: ReturnType<typeof stats> | null; recent: FeedItemOut[];
};

export async function profile(db: Db, id: string, viewerId: string | undefined, today: string): Promise<ProfileOut | undefined> {
  const [l] = await db.query<{ id: string; display_name: string; private_listening: boolean }>('SELECT id, display_name, private_listening FROM listeners WHERE id = $1', [id]);
  if (!l) return undefined;
  const c = await counts(db, id);
  const following = viewerId ? await isFollowing(db, viewerId, id) : false;
  const showStats = !l.private_listening || viewerId === id;
  const s = showStats ? stats(await listenedRowsFor(db, id), today) : null;
  const recent = (await recentBy(db, id)).map(toFeedItem);
  return { id: l.id, displayName: l.display_name, followers: c.followers, following: c.following, isFollowing: following, stats: s, recent };
}

export async function setPrivateListening(db: Db, id: string, value: boolean): Promise<void> {
  await db.query('UPDATE listeners SET private_listening = $2 WHERE id = $1', [id, value]);
}
