// The maintenance switch on DynamoDB: one item while on, no item while off; changed in a Tx that can join the audit transaction.
/**
 * M26 lane SF. `K.config('maintenance')` = `CFG#maintenance` / `V`, type `maintenance`
 * {until, message, updatedAt, updatedBy}. Off = the item is deleted (as the SQL deleted the row). Read
 * strongly (an admin's change is seen at once by the next memo refill); `activeMaintenance` keeps its memo
 * and its `now` in the Postgres module.
 */
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get } from '../../../ddb/store.ts';
import { parseMaintenance, type Maintenance } from '../maintenance.ts';
import { commitOrDefer } from './admin-scope.ts';
import { nowIso, txa, type Db, type Store } from './common.ts';

export async function storedMaintenance(store: Store, _db: Db): Promise<Maintenance | null> {
  const i = await get(store, 'main', K.config('maintenance'));
  return i ? parseMaintenance({ until: i['until'], message: i['message'] }) : null;
}

export async function setMaintenance(store: Store, _db: Db, m: Maintenance | null, by: string): Promise<void> {
  const t = txa(store);
  if (m === null) t.delete('main', K.config('maintenance'));
  else t.put('main', encode('maintenance', K.config('maintenance'), { until: m.until, message: m.message, updatedAt: nowIso(store), updatedBy: by }));
  await commitOrDefer(store, t.raw);
}
