// The hourly feed refresh on DynamoDB: the subscribed-feed list from G4 `Q#feeds`, known guids by GetItem.
/**
 * M26 lane LB, LB-T02 (patterns LB-53/54). `Q#feeds` lists every show with at least one live subscriber
 * (subscriptions.ts keeps it); the job's cursor stays "how many feeds are done" (M25 S10: never a URL), so a
 * page walks the index to `offset` and takes FEEDS_PER_CALL + 1. A known guid is the `U#GUID#…` item.
 */
import type { Db } from '../../../db.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Store } from '../../../ddb/store.ts';
import { FEEDS_PER_CALL } from '../feed-refresh.ts';

export async function subscribedFeedPage(store: Store, _db: Db, offset: number): Promise<{ feed_url: string }[]> {
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G4,
    KeyConditionExpression: 'G4PK = :q',
    ExpressionAttributeValues: { ':q': 'Q#feeds' },
  }, { max: offset + FEEDS_PER_CALL + 1 });
  return items.slice(offset).map((it) => ({ feed_url: String(it['feedUrl']) }));
}

export async function knownGuidRows(store: Store, _db: Db, feedUrl: string, guids: string[]): Promise<{ guid: string }[]> {
  const byKey = new Map([...new Set(guids)].map((g) => [K.U.guid(feedUrl, g).PK, g]));
  const found = await batchGetAll(store, 'main', [...byKey.keys()].map((PK) => ({ PK, SK: 'U' })));
  return found.map((it) => ({ guid: byKey.get(String(it['PK']))! }));
}
