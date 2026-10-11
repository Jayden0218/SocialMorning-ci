// The 400-day sweep of app-use days on DynamoDB: the DA#<day> partitions just before the cutoff, deleted in batches.
/**
 * M26 lane SF (M18 FR-015, research R8). App use is `DA#<day>` / `<listenerId>` in sm-events (lane AC writes it,
 * with TTL 400 days as the backstop). The hourly sweep deletes every day older than 400 days (UTC+8 today − 400,
 * as the SQL `day < today − 400`): it reads the 31 day partitions just before the cutoff (a missed month of sweeps
 * is still caught; anything older is the TTL's) and BatchWrite-deletes them. Returns how many it deleted.
 * While the write bridge is on, the Postgres rows (AC's hybrid copy) are swept too.
 */
import { batchWriteAll } from '../../../ddb/batch.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { sweepDailyActive as sweepDailyActiveDual } from '../../old-rows-sweep.ts';
import { utc8Day } from '../../admin/metrics.ts';
import { bridgeOf, DAY_MS, keyOf, type Db, type Key, type Store } from './common.ts';

export const DAILY_ACTIVE_KEEP_DAYS = 400;
const LOOK_BACK_DAYS = 31;

export async function sweepDailyActive(store: Store, db: Db): Promise<number> {
  const cutoff = Date.parse(`${utc8Day(store.clock.now())}T00:00:00Z`) - DAILY_ACTIVE_KEEP_DAYS * DAY_MS;
  const doomed: Key[] = [];
  for (let i = 1; i <= LOOK_BACK_DAYS; i++) {
    const day = new Date(cutoff - i * DAY_MS).toISOString().slice(0, 10);
    const { items } = await queryAll(store, 'events', {
      KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.ev.dailyActive(day, '-').PK }, ProjectionExpression: 'PK, SK',
    });
    doomed.push(...items.map(keyOf));
  }
  await batchWriteAll(store, 'events', doomed.map((k) => ({ delete: k })));
  const raw = bridgeOf(db);
  if (raw) await sweepDailyActiveDual(raw); // a plain handle: the Postgres body
  return doomed.length;
}
