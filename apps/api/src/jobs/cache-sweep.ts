// The hourly cache sweep on DynamoDB: feed and Apple-search entries older than 7 days go (a Scan of sm-cache — jobs only).
/**
 * M26 lane LB, LB-56. sm-cache has no index (data-model.md §1: disposable), so finding old entries by key
 * prefix is a Scan — allowed only under src/jobs/ (test/ddb-lint.test.ts). The filter reads only entry items
 * (`t = cacheEntry`) of the two prefixes the old SQL swept; chunks go with their entry. TTL (8 days) is the
 * backstop; this keeps the old "deleted at 7 days, counted" behaviour the sweep step reports.
 * Cost: the cache is small (one entry per subscribed feed + recent searches); a Scan reads it once an hour.
 */
import { ScanCommand, type NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import { batchWriteAll } from '../db/ddb/batch.ts';
import { queryAll } from '../db/ddb/paginate.ts';
import type { Item, Store } from '../db/ddb/store.ts';

export async function sweepCacheEntries(store: Store, keepDays: number, prefixes: readonly string[]): Promise<number> {
  const cutoff = new Date(store.clock.now() - keepDays * 86_400_000).toISOString();
  const names: Record<string, string> = { '#t': 't', '#f': 'fetchedAt', '#k': 'key' };
  const values: Record<string, NativeAttributeValue> = { ':t': 'cacheEntry', ':cut': cutoff };
  const ors = prefixes.map((p, i) => { values[`:p${i}`] = p; return `begins_with(#k, :p${i})`; });
  const doomed: Item[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const out = (await store.send(new ScanCommand({
      TableName: store.tables.cache,
      FilterExpression: `#t = :t AND #f < :cut AND (${ors.join(' OR ')})`,
      ProjectionExpression: 'PK, SK',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(start ? { ExclusiveStartKey: start } : {}),
    }))) as { Items?: Item[]; LastEvaluatedKey?: Record<string, unknown> };
    doomed.push(...(out.Items ?? []));
    start = out.LastEvaluatedKey;
  } while (start);
  for (const e of doomed) {
    const { items } = await queryAll(store, 'cache', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': e['PK'] }, ConsistentRead: true });
    await batchWriteAll(store, 'cache', items.map((it) => ({ delete: { PK: String(it['PK']), SK: String(it['SK']) } })));
  }
  return doomed.length;
}
