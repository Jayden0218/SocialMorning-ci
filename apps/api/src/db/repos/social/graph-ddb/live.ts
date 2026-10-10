// "Listening now" on DynamoDB: one item per salted install hash and episode, never an account (strict attribute allowlist).
/**
 * M26 lane SG, SG-T07 (patterns SG-41…SG-43), data-model.md §4 (`LIVE#<episodeId>` / `<installHash>`, sm-events).
 *
 * Guard G-L1 as an allowlist (guard G-M26-SG2): the item is built only by the codec's STRICT type `liveListener`
 * (`episodeId`, `listenerHash`, `seenAt`), so no account id, name or install id can be added to it — `encode`
 * refuses any other attribute. The hash is `sha256(installId : dailySalt)` exactly as before.
 *
 * - Heartbeat: a conditional Put — written when new or when the stored `seenAt` is over 60 s old (the old
 *   `ON CONFLICT … WHERE seen_at < now() - 60 s`); a failed condition is the "dropped" heartbeat.
 * - Items older than 10 minutes are deleted on the next heartbeat to the episode (as the SQL did); TTL (seenAt +
 *   10 min) is only a backstop — DynamoDB deletes late (research R5).
 * - Count: a Query of the episode's partition with `seenAt > now − 180 s` (Select COUNT).
 */
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { countAll, queryAll } from '../../../ddb/paginate.ts';
import { put } from '../../../ddb/store.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';
import { dailySalt, KEEP_S, LIVE_WINDOW_S, listenerHash, WRITE_EVERY_S } from '../live-listeners.ts';
import { nowMs, type Hybrid } from './common.ts';

/** The only item this lane ever writes for "listening now" (strict allowlist — guard G-M26-SG2). */
export function liveItem(episodeId: string, hash: string, seenMs: number) {
  return encode('liveListener', K.ev.live(episodeId, hash), { episodeId, listenerHash: hash, seenAt: new Date(seenMs).toISOString() }, { ttl: ttlAfter(seenMs, KEEP_S * 1000) });
}

export async function heartbeat(h: Hybrid, episodeId: string, installId: string, pepper: string, now = new Date()): Promise<void> {
  const at = now.getTime();
  const hash = listenerHash(installId, dailySalt(pepper, now));
  try {
    await put(h.store, 'events', liveItem(episodeId, hash, at), {
      condition: 'attribute_not_exists(PK) OR #s < :cut', names: { '#s': 'seenAt' }, values: { ':cut': new Date(at - WRITE_EVERY_S * 1000).toISOString() },
    });
  } catch (e) {
    if (!isConditionFailed(e)) throw e; // seen within the minute: nothing to write
  }
  const { items } = await queryAll(h.store, 'events', {
    KeyConditionExpression: 'PK = :pk', FilterExpression: '#s < :old', ExpressionAttributeNames: { '#s': 'seenAt' },
    ExpressionAttributeValues: { ':pk': `LIVE#${episodeId}`, ':old': new Date(at - KEEP_S * 1000).toISOString() }, ConsistentRead: true,
  });
  if (items.length > 0) await batchWriteAll(h.store, 'events', items.map((i) => ({ delete: { PK: String(i['PK']), SK: String(i['SK']) } })));
}

export async function listeningNow(h: Hybrid, episodeId: string): Promise<number> {
  return countAll(h.store, 'events', {
    KeyConditionExpression: 'PK = :pk', FilterExpression: '#s > :since', ExpressionAttributeNames: { '#s': 'seenAt' },
    ExpressionAttributeValues: { ':pk': `LIVE#${episodeId}`, ':since': new Date(nowMs(h) - LIVE_WINDOW_S * 1000).toISOString() }, ConsistentRead: true,
  });
}
