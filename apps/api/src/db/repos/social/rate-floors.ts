// Per-minute rate floors for follows, chat messages and clips, and the follow transaction.
import type { Db } from '../../db.ts';
import { follow } from './follows.ts';

/** Follows this listener made in the last minute. */
export async function recentFollowRows(db: Db, followerId: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>(`SELECT count(*)::int AS n FROM follows WHERE follower_id = $1 AND created_at > now() - interval '1 minute'`, [followerId]);
}

/** PUT /v1/listeners/:id/follow inside a transaction. */
export async function followInTx(db: Db, followerId: string, followedId: string): Promise<'followed' | 'self' | 'no_such_listener' | 'blocked'> {
  return db.transaction((tx) => follow(tx, followerId, followedId));
}

/** Chat messages this listener sent in the last minute. */
export async function recentChatRows(db: Db, senderId: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>(`SELECT count(*)::int AS n FROM chat_messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'`, [senderId]);
}

/** Clips this listener made in the last minute. */
export async function recentClipRows(db: Db, authorId: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>(`SELECT count(*)::int AS n FROM clips WHERE author_id = $1 AND created_at > now() - interval '1 minute'`, [authorId]);
}
