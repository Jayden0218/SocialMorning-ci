// The per-minute floors for chat messages and clips on DynamoDB: counted from the sender's own items, read strongly.
/**
 * M26 lane SC. Clips: the author's index `L#<author>/CLP#<createdAt>#<id>` (one bounded Query). Chat: the sender's
 * conversations touched in the last minute (`CONV#` items carry `updatedAt`), then each pair's newest messages.
 * The follow floor in rate-floors.ts is lane SG's and stays on Postgres until SG moves.
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Store } from '../../../ddb/store.ts';
import { nowMs, prefixItems, rangeItems } from './sc-common.ts';

const MINUTE = 60_000;

export async function recentClipRows(store: Store, _db: Db, authorId: string): Promise<{ n: number }[]> {
  const since = nowMs(store) - MINUTE;
  const items = await rangeItems(store, K.L(authorId), `CLP#${new Date(since - MINUTE).toISOString()}`, 'CLP#~', { keep: (i) => Date.parse(String(i['createdAt'])) > since });
  return [{ n: items.length }];
}

/** At most this many of a pair's newest messages are looked at (the floor is 30 a minute). */
const LOOK = 100;

export async function recentChatRows(store: Store, _db: Db, senderId: string): Promise<{ n: number }[]> {
  const since = nowMs(store) - MINUTE;
  let n = 0;
  const convs = await prefixItems(store, K.L(senderId), K.SC_SK.conversations, { keep: (c) => Date.parse(String(c['updatedAt'] ?? 0)) > since });
  for (const c of convs) {
    const { items } = await queryAll(store, 'main', {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :m)', ExpressionAttributeValues: { ':pk': K.chatPair(senderId, String(c['partnerId'])), ':m': 'M#' },
      ConsistentRead: true, ScanIndexForward: false,
    }, { max: LOOK });
    n += items.filter((m) => m['senderId'] === senderId && Date.parse(String(m['createdAt'])) > since).length;
  }
  return [{ n }];
}
