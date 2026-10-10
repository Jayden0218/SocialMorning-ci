// Listened ranges on DynamoDB: RANGE# items per device, the union kept per day in LDAY#, the badge total moved by the union's change.
/**
 * M26 lane LB, LB-T06 (patterns LB-09…17), data-model.md §3, §7 A.
 *
 * - `L#<id> / RANGE#<episodeId>#<day>#<device>`: one device's merged ranges for an (episode, day) — a phone
 *   REPLACES its own set.
 * - `L#<id> / LDAY#<day>`: the day rollup — `eps` = { episodeId → union ms across devices } — so the listening
 *   page and the profile stats (LB-17) are one Query of the LDAY items, not of every range ever sent.
 * - One TransactWriteItems per (episode, day): the RANGE item, the LDAY item (version-checked: two phones
 *   reporting the same day at once recompute from fresh ranges) and, when the listener's item is on DynamoDB,
 *   `listenedMs` moved by what the UNION gained (G-M21-12; never below 0).
 * - The `listened` activity and "friends are listening" belong to lane SG: `onListened` (social/graph-ddb/activity.ts)
 *   after each (episode, day); while the bridge is on, the Postgres row is written by the Postgres body first.
 */
import { mergeRanges, unionLength, type Range } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { withVersionRetry } from '../../../ddb/retry.ts';
import { get, isoNow, type Item, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import * as pg from '../listened.ts';
import type { ListenedDayIn } from '../listened.ts';
import { onListened } from '../../social/graph-ddb/activity.ts';

async function rangesOf(store: Store, listenerId: string, episodeId: string, day: string): Promise<Item[]> {
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': K.L(listenerId), ':p': `RANGE#${episodeId}#${day}#` },
    ConsistentRead: true,
  });
  return items;
}

/** One (episode, day) from one device; returns the union before and after. */
async function replaceOne(store: Store, listenerId: string, deviceId: string, d: ListenedDayIn): Promise<{ before: number; after: number }> {
  return withVersionRetry(async () => {
    const [ranges, lday, me] = await Promise.all([
      rangesOf(store, listenerId, d.episodeId, d.day), get(store, 'main', K.listenedDay(listenerId, d.day)), get(store, 'main', K.listener(listenerId)),
    ]);
    const before = unionLength(ranges.map((r) => r['ranges'] as unknown as Range[]));
    const merged = mergeRanges(d.ranges);
    const others = ranges.filter((r) => r['deviceId'] !== deviceId).map((r) => r['ranges'] as unknown as Range[]);
    const after = unionLength([...others, merged]);
    const now = isoNow(store.clock);
    const v = Number(lday?.['v'] ?? 0);
    const eps = { ...((lday?.['eps'] as unknown as Record<string, number> | undefined) ?? {}), [d.episodeId]: after };
    const t = tx(store)
      .put('main', encode('listenedRange', K.listenedRange(listenerId, d.episodeId, d.day, deviceId), { listenerId, episodeId: d.episodeId, day: d.day, deviceId, ranges: merged, updatedAt: now }))
      .put('main', encode('listenedDay', K.listenedDay(listenerId, d.day), { listenerId, day: d.day, eps, v: v + 1, updatedAt: now }), lday
        ? { condition: '#v = :seen', names: { '#v': 'v' }, values: { ':seen': v }, label: 'lday' }
        : { condition: 'attribute_not_exists(PK)', label: 'lday' });
    const delta = pg.listenedDelta(before, after);
    if (me && delta !== 0) {
      const cur = Number(me['listenedMs'] ?? 0);
      t.update('main', K.listener(listenerId), {
        update: 'SET #m = :m', condition: 'attribute_exists(PK) AND (attribute_not_exists(#m) OR #m = :cur)',
        names: { '#m': 'listenedMs' }, values: { ':m': Math.max(0, cur + delta), ':cur': cur }, label: 'listenedMs',
      });
    }
    await t.commit();
    return { before, after };
  }, { tries: 5 });
}

export async function replaceRanges(store: Store, db: Db, listenerId: string, deviceId: string, days: readonly ListenedDayIn[]): Promise<number> {
  const raw = bridgeOf(db);
  let accepted = 0;
  for (const d of days) {
    const { before, after } = await replaceOne(store, listenerId, deviceId, d);
    // The bridge writes the same day on Postgres, including the `listened` activity row (lane SG's table, still read in SQL).
    if (raw) await pg.replaceRanges(raw, listenerId, deviceId, [d]);
    // Lane SG (moved): the once-per-(episode, day) `listened` activity item (G6) and friends listening.
    await onListened(store, db, listenerId, d, before, after);
    accepted++;
  }
  return accepted;
}

/** LB-17: per (episode, day) union from the LDAY rollups, with the show (episode META) and finished (position). */
export async function listenedRowsFor(store: Store, _db: Db, listenerId: string): Promise<{ episodeId: string; feedUrl?: string; showTitle?: string; day: string; unionMs: number; finished: boolean }[]> {
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': K.L(listenerId), ':p': 'LDAY#' },
    ConsistentRead: true,
  });
  const rows = items.flatMap((it) => Object.entries((it['eps'] as unknown as Record<string, number> | undefined) ?? {}).map(([episodeId, ms]) => ({ episodeId, day: String(it['day']), unionMs: Number(ms) })));
  const ids = [...new Set(rows.map((r) => r.episodeId))];
  const eps = new Map((await batchGetAll(store, 'main', ids.map((id) => K.episode(id)))).map((it) => [String(it['id']), it]));
  const pos = new Map((await batchGetAll(store, 'main', ids.map((id) => K.position(listenerId, id)))).map((it) => [String(it['episodeId']), it]));
  return rows.map((r) => {
    const e = eps.get(r.episodeId);
    const feedUrl = e?.['feedUrl'] as string | undefined;
    const showTitle = e?.['showTitle'] as string | undefined;
    return { episodeId: r.episodeId, ...(feedUrl ? { feedUrl } : {}), ...(showTitle ? { showTitle } : {}), day: r.day, unionMs: r.unionMs, finished: pos.get(r.episodeId)?.['finished'] === true };
  });
}
