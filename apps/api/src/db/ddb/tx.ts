// TransactWriteItems builder: refuses more than 100 items before sending, and names which item cancelled a transaction.
/**
 * M26 F0-06 / guard G-M26-1. Facts (https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html):
 * - "An ordered array of up to 100 TransactWriteItem objects" … "no two of them can operate on the same item";
 *   aggregate size ≤ 4 MB. All-or-nothing. Costs 2× units even when cancelled (research R3).
 * - On cancel: `TransactionCanceledException` with `CancellationReasons`, "ordered in the order of requested
 *   items, if an item has no error it will have `None` code" — the literal string "None". Other codes:
 *   ConditionalCheckFailed, ItemCollectionSizeLimitExceeded, TransactionConflict, ProvisionedThroughputExceeded,
 *   ThrottlingError, ValidationError.
 * - Transactions cannot be performed using indexes (research R3): every action names a base-table key.
 *
 * The 100-item check happens HERE, before the request: a 101-item write is a code bug (it must be a job —
 * data-model.md §8) and must fail the same way on DynamoDB Local and on AWS. Each action may carry a `label`
 * so a repo can tell WHICH condition failed (`err.failed('email')` → the email is taken).
 */
import { TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import { itemSize } from './codec.ts';
import type { Item, Key, Store, TableRole } from './store.ts';

export const MAX_TX_ITEMS = 100;
export const MAX_TX_BYTES = 4 * 1024 * 1024;

type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];
type Opts = { condition?: string; names?: Record<string, string>; values?: Record<string, NativeAttributeValue>; label?: string; returnOld?: boolean };

export class TxTooLargeError extends Error {
  constructor(readonly count: number, readonly limit = MAX_TX_ITEMS) {
    super(`transaction has ${count} items; DynamoDB allows at most ${limit} — split it into a job (data-model.md §8)`);
    this.name = 'TxTooLargeError';
  }
}

export class TxDuplicateKeyError extends Error {
  constructor(readonly key: string) {
    super(`transaction touches ${key} twice; DynamoDB refuses two actions on one item`);
    this.name = 'TxDuplicateKeyError';
  }
}

export type TxReason = { index: number; label: string | undefined; code: string; message: string | undefined; item: unknown };

/** A cancelled transaction, with each item's reason (the item order of the request). */
export class TxCancelled extends Error {
  constructor(readonly reasons: TxReason[], readonly source?: unknown) {
    const bad = reasons.filter((r) => r.code !== 'None');
    super(`transaction cancelled: ${bad.map((r) => `#${r.index}${r.label ? `(${r.label})` : ''} ${r.code}`).join(', ') || 'no reason given'}`);
    this.name = 'TxCancelled';
  }
  /** Labels of the items whose condition failed. */
  failedLabels(): string[] {
    return this.reasons.filter((r) => r.code === 'ConditionalCheckFailed' && r.label).map((r) => r.label!);
  }
  failed(label: string): boolean { return this.failedLabels().includes(label); }
  get conflict(): boolean { return this.reasons.some((r) => r.code === 'TransactionConflict'); }
  get conditionFailed(): boolean { return this.reasons.some((r) => r.code === 'ConditionalCheckFailed'); }
}

type RawReason = { Code?: string; Message?: string; Item?: unknown };

/** Map an SDK `TransactionCanceledException` to `TxCancelled`; anything else is returned unchanged. */
export function mapTxError(e: unknown, labels: readonly (string | undefined)[]): unknown {
  const err = e as { name?: string; CancellationReasons?: RawReason[] } | undefined;
  if (err?.name !== 'TransactionCanceledException') return e;
  const raw = err.CancellationReasons ?? [];
  const reasons: TxReason[] = raw.map((r, index) => ({ index, label: labels[index], code: r.Code ?? 'None', message: r.Message, item: r.Item }));
  return new TxCancelled(reasons, e);
}

export class Tx {
  private readonly actions: TransactItem[] = [];
  private readonly labels: (string | undefined)[] = [];
  private readonly keys: string[] = [];
  private bytes = 0;

  constructor(private readonly store: Store) {}

  get size(): number { return this.actions.length; }

  private add(table: TableRole, key: Key, action: TransactItem, label: string | undefined, bytes = 0): this {
    this.actions.push(action);
    this.labels.push(label);
    this.keys.push(`${this.store.tables[table]}|${key.PK}|${key.SK}`);
    this.bytes += bytes;
    return this;
  }

  private static expr(o: Opts) {
    return {
      ...(o.condition ? { ConditionExpression: o.condition } : {}),
      ...(o.names && Object.keys(o.names).length ? { ExpressionAttributeNames: o.names } : {}),
      ...(o.values && Object.keys(o.values).length ? { ExpressionAttributeValues: o.values } : {}),
      ...(o.returnOld ? { ReturnValuesOnConditionCheckFailure: 'ALL_OLD' as const } : {}),
    };
  }

  put(table: TableRole, item: Item, o: Opts = {}): this {
    const key = { PK: String(item['PK']), SK: String(item['SK']) };
    return this.add(table, key, { Put: { TableName: this.store.tables[table], Item: item, ...Tx.expr(o) } }, o.label, itemSize(item));
  }

  update(table: TableRole, key: Key, o: Opts & { update: string }): this {
    return this.add(table, key, { Update: { TableName: this.store.tables[table], Key: key, UpdateExpression: o.update, ...Tx.expr(o) } }, o.label);
  }

  delete(table: TableRole, key: Key, o: Opts = {}): this {
    return this.add(table, key, { Delete: { TableName: this.store.tables[table], Key: key, ...Tx.expr(o) } }, o.label);
  }

  /** A condition on an item the transaction does not change. */
  check(table: TableRole, key: Key, o: Opts & { condition: string }): this {
    return this.add(table, key, { ConditionCheck: { TableName: this.store.tables[table], Key: key, ...Tx.expr(o), ConditionExpression: o.condition } }, o.label);
  }

  /** Sends the transaction. `token` = ClientRequestToken (idempotent for 10 minutes, ≤ 36 chars). */
  async commit(opts: { token?: string } = {}): Promise<void> {
    if (this.actions.length === 0) return;
    if (this.actions.length > MAX_TX_ITEMS + 1) throw new TxTooLargeError(this.actions.length);
    const seen = new Set<string>();
    for (const k of this.keys) {
      if (seen.has(k)) throw new TxDuplicateKeyError(k);
      seen.add(k);
    }
    if (this.bytes > MAX_TX_BYTES) throw new Error(`transaction is ~${this.bytes} bytes; DynamoDB allows 4 MB`);
    const input: TransactWriteCommandInput = { TransactItems: this.actions, ...(opts.token ? { ClientRequestToken: opts.token } : {}) };
    try {
      await this.store.send(new TransactWriteCommand(input));
    } catch (e) {
      throw mapTxError(e, this.labels);
    }
  }
}

export const tx = (store: Store): Tx => new Tx(store);
