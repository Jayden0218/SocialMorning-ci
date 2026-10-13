// The hourly sweep's push_sent step on DynamoDB: nothing to delete, the items expire by TTL.
/**
 * Lane AC writes each "never twice" record (`PUSHSENT#…` in sm-events) with a TTL of 31 days (push.ts `pushSentItem`),
 * so DynamoDB removes them itself; this answers 0.
 */
import type { Db } from '../../../db.ts';
import type { Store } from '../../../ddb/store.ts';

export async function sweepOldPushSent(_store: Store, _db: Db): Promise<number> {
  return 0;
}
