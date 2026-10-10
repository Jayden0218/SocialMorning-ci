// The monthly listening report on DynamoDB: the month's listened ranges, and the listener's comments and clips counted from their own index.
/**
 * M26 lane SC (M19 US8). The ranges are lane LB's `L#<id>/RANGE#<episodeId>#<day>#<device>` items (one Query of the
 * listener's partition, filtered to the month — the same per-device sums the SQL made), the titles lane LB's episode
 * items; the counts come from this lane's author indexes (`CMT#`, `CLP#`) between the month's first and next first day.
 * A placeholder left the author's index when it lost its author, so it is not counted (the old `deleted_at IS NULL`).
 */
import type { Db } from '../../../db.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import * as K from '../../../ddb/keys.ts';
import type { Store } from '../../../ddb/store.ts';
import { buildReport, monthBounds, type RangeRow, type Report } from '../report.ts';
import { prefixItems, rangeItems } from './sc-common.ts';

export async function monthReport(store: Store, _db: Db, listenerId: string, month: string): Promise<Report | undefined> {
  const b = monthBounds(month);
  if (!b) return undefined;
  const ranges = await prefixItems(store, K.L(listenerId), 'RANGE#', { keep: (r) => String(r['day']) >= b.from && String(r['day']) < b.to });
  const eps = new Map((await batchGetAll(store, 'main', [...new Set(ranges.map((r) => String(r['episodeId'])))].map((id) => K.episode(id))))
    .map((e) => [String(e['id']), e]));
  const rows: RangeRow[] = ranges.map((r) => {
    const e = eps.get(String(r['episodeId']));
    const s = (v: unknown) => (v === undefined || v === null ? null : String(v));
    return { episode_id: String(r['episodeId']), ranges: r['ranges'], title: s(e?.['title']), show_title: s(e?.['showTitle']), feed_url: s(e?.['feedUrl']), image_url: s(e?.['imageUrl']) };
  });
  const from = new Date(`${b.from}T00:00:00.000Z`).toISOString();
  const to = new Date(`${b.to}T00:00:00.000Z`).toISOString();
  const inMonth = (i: Record<string, unknown>) => String(i['createdAt']) >= from && String(i['createdAt']) < to;
  // A sort key `CMT#<time>#<id>` is never equal to the bound `CMT#<time>`, so the range holds exactly the month.
  const comments = (await rangeItems(store, K.L(listenerId), `CMT#${from}`, `CMT#${to}`, { keep: inMonth })).length;
  const clips = (await rangeItems(store, K.L(listenerId), `CLP#${from}`, `CLP#${to}`, { keep: (i) => inMonth(i) && !i['deletedAt'] })).length;
  return buildReport(month, rows, { comments, clips });
}
