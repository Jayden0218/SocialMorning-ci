// "Next up" on DynamoDB: who else listened (the listen index, then those listeners' own activity), and what the viewer finished.
/**
 * M26 lane DV (DV-59…DV-61). Counts only, never who (guard G6).
 * - alsoListened: the episode's public listen rows (listens.ts) name its listeners; each one's own public `listened`
 *   rows (lane SG's `ACT#<actor>` partition) are the co-listens. The count is the SQL's self-join: for every listener,
 *   (their rows of this episode) × (their rows of the other one); order by that, then the newest co-listen. Bounded
 *   by the episode's listeners; cached an hour per episode by the caller.
 * - finishedKeys: the viewer's finished positions (lane LB's `POS#` items) and those episodes' (feed, guid).
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Store } from '../../../ddb/store.ts';
import type { EpRow as NextEpRow } from '../nextup.ts';
import { episodesByIds, mapLimit, partitionItems } from './common.ts';
import { listensOf } from './listens.ts';

export async function alsoListenedRows(store: Store, _db: Db, episodeId: string): Promise<NextEpRow[]> {
  const mine = new Map<string, number>();
  for (const m of await listensOf(store, episodeId)) if (!m.hidden) mine.set(m.actorId, (mine.get(m.actorId) ?? 0) + 1);
  const score = new Map<string, { n: number; newest: string }>();
  await mapLimit([...mine.keys()], 8, async (actor) => {
    const { items } = await queryAll(store, 'events', {
      KeyConditionExpression: 'PK = :pk', FilterExpression: '#k = :l AND #h = :f',
      ExpressionAttributeNames: { '#k': 'kind', '#h': 'hidden' }, ExpressionAttributeValues: { ':pk': `ACT#${actor}`, ':l': 'listened', ':f': false }, ConsistentRead: true,
    });
    const times = mine.get(actor)!;
    for (const b of items) {
      const ep = String(b['episodeId']);
      if (ep === episodeId) continue;
      const s = score.get(ep) ?? score.set(ep, { n: 0, newest: '' }).get(ep)!;
      s.n += times;
      if (String(b['createdAt']) > s.newest) s.newest = String(b['createdAt']);
    }
  });
  const ranked = [...score.entries()].sort(([, a], [, b]) => b.n - a.n || (a.newest < b.newest ? 1 : a.newest > b.newest ? -1 : 0));
  const eps = await episodesByIds(store, ranked.map(([id]) => id));
  return ranked.flatMap(([id]) => {
    const e = eps.get(id);
    return e ? [e] : [];
  }).slice(0, 3);
}

export async function finishedKeys(store: Store, _db: Db, listenerId: string): Promise<{ feed_url: string; guid: string }[]> {
  const pos = await partitionItems(store, K.L(listenerId), { prefix: K.LISTENER_SK.positions, filter: { expr: '#f = :t', names: { '#f': 'finished' }, values: { ':t': true } } });
  const eps = await episodesByIds(store, pos.map((p) => String(p['episodeId'])));
  return [...eps.values()].map((e) => ({ feed_url: e.feed_url, guid: e.guid }));
}
