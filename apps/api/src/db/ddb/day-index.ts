// Reads one UTC day of the sm-events E1 index across its 8 shards and the old unsharded key (M32 C7).
import type { QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { dayPks, INDEX } from './keys.ts';
import { queryAll, type QueryAllOptions } from './paginate.ts';
import { isThrottle, withRetry, type RetryOptions } from './retry.ts';
import type { Item, Store } from './store.ts';

/**
 * Every E1 item of `day` whose sort key matches `sk` (a condition on `E1SK` using `:sk`/`:sk2`, e.g. `begins_with(E1SK, :sk)`
 * or `E1SK > :sk`). The nine partitions are queried in parallel and the result is merged by `E1SK`, the order one
 * partition used to give.
 */
export type DayQueryOptions = QueryAllOptions & {
  /** Throttle retry (GA): attempts incl. the first (default 5), first back-off ms (default 50, doubling with jitter), injectable sleep. */
  retry?: Pick<RetryOptions, 'tries' | 'baseMs' | 'sleep'>;
};

/**
 * A day Query that the index throttled (dev/qa indexes have 1 RCU, spec 032) is tried again a few times with a short
 * exponential back-off and jitter; any other error, and a throttle that outlasts the attempts, is thrown as before.
 */
export async function queryDay(store: Store, day: string, sk: { condition: string; values: Record<string, unknown> }, opts: DayQueryOptions = {}): Promise<Item[]> {
  // The nine partitions are independent, so they are read together (a cold hunt read 30 days x 9 of them one by one).
  const parts = await Promise.all(dayPks(day).map(async (pk) => {
    const input: Omit<QueryCommandInput, 'TableName'> = {
      IndexName: INDEX.E1, KeyConditionExpression: `E1PK = :d AND ${sk.condition}`, ExpressionAttributeValues: { ':d': pk, ...sk.values },
    };
    const { retry, ...q } = opts;
    return (await withRetry(() => queryAll(store, 'events', input, q), { tries: 5, baseMs: 50, ...retry, retryOn: isThrottle })).items;
  }));
  const all: Item[] = parts.flat(); // partition order, as before: the sort below is stable, so ties keep it
  return all.sort((a, b) => (String(a['E1SK']) < String(b['E1SK']) ? -1 : String(a['E1SK']) > String(b['E1SK']) ? 1 : 0));
}
