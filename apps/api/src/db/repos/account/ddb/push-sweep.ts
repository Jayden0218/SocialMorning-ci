// The hourly sweep's push_sent step on DynamoDB: nothing to delete, the items expire by TTL.
/**
 * M26 lane LE (gap 4: `sweepOldPushSent` was a plain SQL function). Lane AC writes each "never twice" record (`PUSHSENT#…`
 * in sm-events) with a TTL of 31 days (push.ts `pushSentItem`), so DynamoDB removes them itself. While the write bridge is
 * on, the Postgres rows are still swept (same statement as before); otherwise this answers 0.
 */
import { bridgeOf } from '../../../backend-ddb.ts';
import type { Db } from '../../../db.ts';
import type { Store } from '../../../ddb/store.ts';

export async function sweepOldPushSent(_store: Store, db: Db): Promise<number> {
  const raw = bridgeOf(db);
  if (!raw) return 0;
  const { sweepOldPushSentPg } = await import('../../old-rows-sweep.ts');
  return sweepOldPushSentPg(raw);
}
