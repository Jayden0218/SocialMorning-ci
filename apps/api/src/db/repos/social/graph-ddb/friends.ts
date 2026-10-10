// "Friends are listening" on DynamoDB: one inbox item per (episode, friend) in my partition, written when a friend listens.
/**
 * M26 lane SG, SG-T03 (pattern SG-60), data-model.md §4 (`FL#<follower>` / `<episodeId>#<actorId>`, TTL 7 d).
 *
 * Written by the outbox (`sg:listen`, activity.ts) on each listened sync of someone I follow — never while their
 * listening is private, never on a day whose activity was written hidden — and backfilled on follow from their
 * `LR#` items (their last week's listens). The read is one Query of my partition, filtered as the SQL filtered:
 * the last 7 days, people I still follow, no block either way, not private / suspended / waiting for deletion NOW,
 * not a day written hidden (the day's `U#ACT` item), episodes registered and not hidden by their host (lane ST,
 * Postgres). Newest first, at most 1000 rows; the route groups them.
 */
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Item } from '../../../ddb/store.ts';
import type { FriendsListeningRow } from '../friends-listening.ts';
import { hiddenEpisodeIds } from '../../studio/hidden-episodes.ts';
import { blockedEitherWay, DAY_MS, episodesById, iso, listenersById, nowMs, str, type Hybrid } from './common.ts';
import { FRIENDS_DAYS } from './activity.ts';
import { followSet } from './follows.ts';

export async function friendsListeningRows(h: Hybrid, me: string): Promise<FriendsListeningRow[]> {
  const since = iso(nowMs(h) - FRIENDS_DAYS * DAY_MS);
  const [{ items }, follows, blocked] = await Promise.all([
    queryAll(h.store, 'events', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `FL#${me}` }, ConsistentRead: true }),
    followSet(h, me), blockedEitherWay(h, me),
  ]);
  let rows = items.filter((r) => String(r['at']) > since && follows.has(String(r['actorId'])) && !blocked.has(String(r['actorId'])));
  const actors = await listenersById(h.store, rows.map((r) => String(r['actorId'])));
  rows = rows.filter((r) => {
    const l = actors.get(String(r['actorId']));
    return l !== undefined && l['privateListening'] !== true && !l['suspendedAt'] && !l['hiddenAt'];
  });
  const marks = new Map((await batchGetAll(h.store, 'events', rows.map((r) => K.ev.activityDedupe(String(r['actorId']), 'listened', String(r['episodeId']), String(r['day'])))))
    .map((m) => [String(m['PK']), m]));
  rows = rows.filter((r) => marks.get(K.ev.activityDedupe(String(r['actorId']), 'listened', String(r['episodeId']), String(r['day'])).PK)?.['hidden'] !== true);
  const eps = await episodesById(h.store, rows.map((r) => String(r['episodeId'])));
  const hiddenEps = await hiddenEpisodeIds(h.pg); // lane ST's (Postgres until it moves)
  return rows
    .filter((r) => eps.has(String(r['episodeId'])) && !hiddenEps.has(String(r['episodeId'])))
    .sort((a, b) => String(b['at']).localeCompare(String(a['at'])))
    .slice(0, 1000)
    .map((r): FriendsListeningRow => {
      const e = eps.get(String(r['episodeId'])) as Item;
      const l = actors.get(String(r['actorId'])) as Item;
      return {
        episode_id: String(r['episodeId']), listener_id: String(r['actorId']), display_name: String(l['displayName']), at: String(r['at']),
        feed_url: String(e['feedUrl']), guid: String(e['guid']), title: String(e['title']), show_title: str(e['showTitle']), image_url: str(e['imageUrl']),
        duration_ms: e['durationMs'] === null || e['durationMs'] === undefined ? null : Number(e['durationMs']), enclosure_url: String(e['enclosureUrl']),
      };
    });
}
