// Test-only Store wrappers for what DynamoDB Local cannot do: GSI lag, transaction conflicts, faults by key prefix.
/**
 * M26 F0-10 (plan.md "Guards against DynamoDB Local's gaps", research R9):
 * - DynamoDB Local's reads "appear to be strongly consistent", so a repo that reads its own write through a
 *   GSI passes locally and fails on AWS ("Global secondary indexes support eventually consistent reads" —
 *   https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html). `withGsiLag` hides from GSI
 *   Query results every item written since the last `settle()` — tests tagged `gsiLag` go red on such a repo.
 *   (It models "a new or changed item is not yet in the index"; a deleted item still showing is not modelled.)
 * - DynamoDB Local never throws `TransactionConflict` (research R9). `withConflicts` cancels chosen
 *   TransactWriteItems with the same exception shape AWS sends (CancellationReasons, "None" for the others).
 * - `withFaults` makes one command type for one key prefix throw (replaces the DROP/RENAME schema-break guards).
 * Nothing here is imported by app code.
 */
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand, BatchWriteCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { wrapStore, type DdbCommand, type Store } from './store.ts';

type Rec = Record<string, unknown>;
const keyStr = (table: string, k: Rec | undefined) => `${table}|${String(k?.['PK'])}|${String(k?.['SK'])}`;

/** Every (table, PK, SK) a write command touches. */
export function writtenKeys(cmd: DdbCommand): string[] {
  const i = cmd.input as Rec;
  if (cmd instanceof PutCommand) return [keyStr(String(i['TableName']), i['Item'] as Rec)];
  if (cmd instanceof UpdateCommand || cmd instanceof DeleteCommand) return [keyStr(String(i['TableName']), i['Key'] as Rec)];
  if (cmd instanceof TransactWriteCommand) {
    return ((i['TransactItems'] as Rec[]) ?? []).flatMap((t) => {
      const a = (t['Put'] ?? t['Update'] ?? t['Delete']) as Rec | undefined;
      if (!a) return [];
      return [keyStr(String(a['TableName']), (a['Item'] ?? a['Key']) as Rec)];
    });
  }
  if (cmd instanceof BatchWriteCommand) {
    return Object.entries((i['RequestItems'] as Record<string, Rec[]>) ?? {}).flatMap(([table, reqs]) =>
      reqs.map((r) => keyStr(table, ((r['PutRequest'] as Rec | undefined)?.['Item'] ?? (r['DeleteRequest'] as Rec | undefined)?.['Key']) as Rec)));
  }
  return [];
}

/** Every partition key a command reads or writes (for fault rules). */
export function touchedPartitions(cmd: DdbCommand): string[] {
  const i = cmd.input as Rec;
  if (cmd instanceof GetCommand) return [String((i['Key'] as Rec)?.['PK'])];
  if (cmd instanceof QueryCommand) {
    const vals = Object.values((i['ExpressionAttributeValues'] as Rec) ?? {}).filter((v): v is string => typeof v === 'string');
    return vals;
  }
  if (cmd instanceof BatchGetCommand) {
    return Object.values((i['RequestItems'] as Record<string, { Keys?: Rec[] }>) ?? {}).flatMap((r) => (r.Keys ?? []).map((k) => String(k['PK'])));
  }
  return writtenKeys(cmd).map((k) => k.split('|')[1] ?? '');
}

export type GsiLagStore = Store & { settle(): void; pending(): number };

export function withGsiLag(store: Store): GsiLagStore {
  const unsettled = new Set<string>();
  const wrapped = wrapStore(store, async (cmd, next) => {
    const out = await next(cmd);
    for (const k of writtenKeys(cmd)) unsettled.add(k);
    if (cmd instanceof QueryCommand && (cmd.input as Rec)['IndexName'] && unsettled.size > 0) {
      const table = String((cmd.input as Rec)['TableName']);
      const o = out as { Items?: Rec[]; Count?: number };
      const items = (o.Items ?? []).filter((it) => !unsettled.has(keyStr(table, it)));
      return { ...o, Items: items, Count: items.length };
    }
    return out;
  });
  return Object.assign(wrapped, { settle: () => unsettled.clear(), pending: () => unsettled.size });
}

export type ConflictStore = Store & { cancelled(): number };

/**
 * Cancels the transactions `pick(n)` chooses (n = 1 for the first TransactWriteItems), with code
 * `TransactionConflict` on the first action. The request is NOT sent, as on AWS where nothing is written.
 */
export function withConflicts(store: Store, pick: (n: number) => boolean): ConflictStore {
  let n = 0;
  let cancelled = 0;
  const wrapped = wrapStore(store, async (cmd, next) => {
    if (cmd instanceof TransactWriteCommand) {
      n++;
      if (pick(n)) {
        cancelled++;
        const count = ((cmd.input as Rec)['TransactItems'] as unknown[]).length;
        throw new TransactionCanceledException({
          $metadata: {},
          message: 'Transaction cancelled, please refer cancellation reasons for specific reasons [TransactionConflict]',
          CancellationReasons: Array.from({ length: count }, (_, i) => (i === 0
            ? { Code: 'TransactionConflict', Message: 'Transaction is ongoing for the item.' }
            : { Code: 'None' })),
        });
      }
    }
    return next(cmd);
  });
  return Object.assign(wrapped, { cancelled: () => cancelled });
}

export type FaultRule = {
  /** Command class name to fail, e.g. 'GetCommand', 'QueryCommand', or '*' for any. */
  command: string;
  /** A partition key prefix, e.g. 'CFG#discover_settings'. */
  prefix: string;
  error?: () => Error;
};

const COMMANDS: Record<string, abstract new (...a: never[]) => unknown> = {
  GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, TransactWriteCommand, BatchGetCommand, BatchWriteCommand,
};

export function withFaults(store: Store, rules: FaultRule[]): Store {
  return wrapStore(store, async (cmd, next) => {
    for (const r of rules) {
      const cls = COMMANDS[r.command];
      if (r.command !== '*' && !(cls && cmd instanceof cls)) continue;
      if (touchedPartitions(cmd).some((pk) => pk.startsWith(r.prefix))) {
        throw r.error ? r.error() : Object.assign(new Error(`injected fault on ${r.prefix}`), { name: 'InternalServerError' });
      }
    }
    return next(cmd);
  });
}
