// The hourly sweep's cache and rec-events deletes on DynamoDB (LB-56, LB-58).
import type { Db } from '../../../db.ts';
import { bridgeOf } from '../../../backend-ddb.ts';
import type { Store } from '../../../ddb/store.ts';
import { sweepCacheEntries } from '../../../../jobs/cache-sweep.ts';
import * as pg from '../../old-rows-sweep.ts';

export async function sweepOldCache(store: Store, db: Db): Promise<number> {
  const n = await sweepCacheEntries(store, pg.CACHE_KEEP_DAYS, ['apple:search:', 'feed:']);
  const raw = bridgeOf(db);
  if (raw) await pg.sweepOldCache(raw);
  return n;
}

export { sweepOldRecEvents } from './rec-events.ts';
