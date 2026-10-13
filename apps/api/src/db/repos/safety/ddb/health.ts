// The health check's database probe on DynamoDB: one GetItem.
/** Rejects when DynamoDB cannot be reached. */
import * as K from '../../../ddb/keys.ts';
import { get } from '../../../ddb/store.ts';
import type { Db, Store } from './common.ts';

export async function ping(store: Store, _db: Db): Promise<void> {
  await get(store, 'main', K.config('health'));
}
