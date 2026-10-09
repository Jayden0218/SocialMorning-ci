// Batch reads (100 keys) and writes (25 puts/deletes) in chunks, retrying what DynamoDB left unprocessed.
/**
 * M26 F0-06. Limits (https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html,
 * research R1): BatchGetItem ≤ 100 items / 16 MB; BatchWriteItem ≤ 25 put/delete / 16 MB, NOT atomic,
 * no conditions. Both may return `UnprocessedKeys` / `UnprocessedItems`, which must be sent again
 * (with back-off). A batch write is never used where atomicity matters — that is tx.ts.
 */
import { BatchGetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Item, Key, Store, TableRole } from './store.ts';

export const BATCH_GET_MAX = 100;
export const BATCH_WRITE_MAX = 25;

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
const chunks = <T>(xs: readonly T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** Reads every key (strongly by default); returns found items in no particular order. */
export async function batchGetAll(store: Store, table: TableRole, keys: readonly Key[], opts: { consistent?: boolean; tries?: number } = {}): Promise<Item[]> {
  const name = store.tables[table];
  const found: Item[] = [];
  for (const part of chunks(keys, BATCH_GET_MAX)) {
    let pending: Record<string, unknown>[] = part.map((k) => ({ PK: k.PK, SK: k.SK }));
    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt >= (opts.tries ?? 8)) throw new Error(`batchGet: ${pending.length} keys still unprocessed`);
      if (attempt > 0) await sleep(20 * 2 ** attempt);
      const out = (await store.send(new BatchGetCommand({ RequestItems: { [name]: { Keys: pending, ConsistentRead: opts.consistent ?? true } } }))) as {
        Responses?: Record<string, Item[]>; UnprocessedKeys?: Record<string, { Keys?: Record<string, unknown>[] }>;
      };
      found.push(...(out.Responses?.[name] ?? []));
      pending = out.UnprocessedKeys?.[name]?.Keys ?? [];
    }
  }
  return found;
}

export type WriteRequest = { put: Item } | { delete: Key };

/** Writes every request, 25 at a time, re-sending unprocessed ones. Not atomic. */
export async function batchWriteAll(store: Store, table: TableRole, requests: readonly WriteRequest[], opts: { tries?: number } = {}): Promise<void> {
  const name = store.tables[table];
  for (const part of chunks(requests, BATCH_WRITE_MAX)) {
    let pending: unknown[] = part.map((r) => ('put' in r ? { PutRequest: { Item: r.put } } : { DeleteRequest: { Key: { PK: r.delete.PK, SK: r.delete.SK } } }));
    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt >= (opts.tries ?? 8)) throw new Error(`batchWrite: ${pending.length} requests still unprocessed`);
      if (attempt > 0) await sleep(20 * 2 ** attempt);
      const out = (await store.send(new BatchWriteCommand({ RequestItems: { [name]: pending as never } }))) as { UnprocessedItems?: Record<string, unknown[]> };
      pending = out.UnprocessedItems?.[name] ?? [];
    }
  }
}
