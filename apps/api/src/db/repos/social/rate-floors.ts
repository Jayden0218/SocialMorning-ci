// Per-minute rate floors for follows, chat messages and clips, and the follow transaction.
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import { follow } from './follows.ts';

/** Follows this listener made in the last minute. */
async function recentFollowRowsPg(db: Db, followerId: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>(`SELECT count(*)::int AS n FROM follows WHERE follower_id = $1 AND created_at > now() - interval '1 minute'`, [followerId]);
}

/** PUT /v1/listeners/:id/follow inside a transaction. */
async function followInTxPg(db: Db, followerId: string, followedId: string): Promise<'followed' | 'self' | 'no_such_listener' | 'blocked'> {
  return db.transaction((tx) => follow(tx, followerId, followedId));
}

/** Chat messages this listener sent in the last minute. */
async function recentChatRowsPg(db: Db, senderId: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>(`SELECT count(*)::int AS n FROM chat_messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'`, [senderId]);
}

/** Clips this listener made in the last minute. */
async function recentClipRowsPg(db: Db, authorId: string): Promise<{ n: number }[]> {
  return db.query<{ n: number }>(`SELECT count(*)::int AS n FROM clips WHERE author_id = $1 AND created_at > now() - interval '1 minute'`, [authorId]);
}

// M26 lane SC (chat messages and clips are its tables): on DynamoDB these run `repos/social/ddb/rate-floors.ts` (db/backend.ts).
export const recentChatRows = dual('sc/rate-floors', 'recentChatRows', recentChatRowsPg);
export const recentClipRows = dual('sc/rate-floors', 'recentClipRows', recentClipRowsPg);

// M26 lane SG: each runs on DynamoDB when the Db carries a Store (src/db/backend.ts; bodies in graph-ddb/).
export const recentFollowRows = dual('sg/index', 'recentFollowRows', recentFollowRowsPg);
export const followInTx = dual('sg/index', 'followInTx', followInTxPg);
