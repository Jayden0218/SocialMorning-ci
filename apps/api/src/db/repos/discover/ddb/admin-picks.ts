// The owner's daily picks on DynamoDB: one document item per day, saved with a version condition.
/**
 * M26 lane DV (DV-84…DV-88). `PICKS / <yyyy-mm-dd>` (type `pickDay`): `version`, `items` in order (feedUrl, guid,
 * why, warning), who saved it and when. A save is one Put conditioned on the version the editor loaded (G-P3); 0 items
 * deletes the day (the old ON DELETE CASCADE of pick_items is the same Delete). The calendar is one Query between two
 * days of the one partition.
 */
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { commitOrDefer } from '../../safety/ddb/admin-scope.ts';
import type { PickDay, PickItemRow } from '../../admin/admin-picks.ts';
import { nowIso, partitionItems } from './common.ts';

type Stored = { feedUrl: string; guid?: string; why: string; warning?: string };

export async function getPickDay(store: Store, _db: Db, day: string): Promise<PickDay | undefined> {
  const d = await get(store, 'main', K.pickDay(day));
  if (!d) return undefined;
  return {
    day, version: Number(d['version']),
    items: ((d['items'] as Stored[] | undefined) ?? []).map((r) => ({ feedUrl: r.feedUrl, ...(r.guid ? { guid: r.guid } : {}), why: r.why, ...(r.warning ? { warning: r.warning } : {}) })),
  };
}

export async function adminPickDays(store: Store, _db: Db, from: string, to: string): Promise<{ day: string; count: number }[]> {
  return (await partitionItems(store, 'PICKS', { from, to }))
    .map((d) => ({ day: String(d['day']), count: ((d['items'] as unknown[] | undefined) ?? []).length }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

export async function putPickDay(store: Store, _db: Db, day: string, version: number, items: readonly PickItemRow[], by: string): Promise<number> {
  const cur = await get(store, 'main', K.pickDay(day));
  const current = cur ? Number(cur['version']) : 0;
  if (current !== version) throw new ApiError('changed', 'Changed elsewhere — reload.', { version: current });
  const onFail = { pickday: () => new ApiError('changed', 'Changed elsewhere — reload.', { version: current + 1 }) };
  const cond = cur
    ? { condition: '#v = :cur', names: { '#v': 'version' }, values: { ':cur': current }, label: 'pickday' }
    : { condition: 'attribute_not_exists(PK)', label: 'pickday' };
  if (items.length === 0) {
    if (cur) await commitOrDefer(store, tx(store).delete('main', K.pickDay(day), cond), onFail);
    return 0;
  }
  const next = current + 1;
  await commitOrDefer(store, tx(store).put('main', encode('pickDay', K.pickDay(day), {
    day, version: next, updatedAt: nowIso(store), updatedBy: by,
    items: items.map((p) => ({ feedUrl: p.feedUrl, ...(p.guid !== undefined ? { guid: p.guid } : {}), why: p.why, ...(p.warning ? { warning: p.warning } : {}) })),
  }), cond), onFail);
  return next;
}
