// The Store handle every DynamoDB repo takes: the client, the three table names, a clock and a cursor secret.
/**
 * M26 F0-06 (plan.md "Why a Db-level adapter is not enough"): each repo function keeps its name,
 * parameters and return type; only its first parameter changes from `Db` to `Store`.
 *
 * Every request goes through `store.send` — the one interception point the test wrappers use
 * (GSI lag, transaction conflicts, fault injection by key prefix: test-wrappers.ts). Repos call the
 * typed helpers below (`get`, `put`, `update`, `del`, `query`) or `tx.ts` / `paginate.ts` / `batch.ts`,
 * never the SDK client directly.
 *
 * Tables are named by role (`main`, `events`, `cache` — data-model.md §1); production names are
 * `sm-main` etc., tests get a per-test copy (`<prefix>_main`, schema.ts).
 */
import {
  DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand,
  type DeleteCommandInput, type GetCommandInput, type PutCommandInput, type QueryCommandInput,
  type QueryCommandOutput, type UpdateCommandInput, type UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import type { Clients } from './client.ts';
import { assertAppendOnly } from './append-only.ts';

export type TableRole = 'main' | 'events' | 'cache';
export type Tables = Readonly<Record<TableRole, string>>;
export type Item = Record<string, NativeAttributeValue>;
export type Key = { PK: string; SK: string };

export const PROD_TABLES: Tables = { main: 'sm-main', events: 'sm-events', cache: 'sm-cache' };

/** Table names for a per-test (or per-rehearsal) copy: `<prefix>_main` … */
export function prefixedTables(prefix: string): Tables {
  return { main: `${prefix}_main`, events: `${prefix}_events`, cache: `${prefix}_cache` };
}

/** Milliseconds since the epoch. Tests replace it (fixtures.ts `testClock`) instead of back-dating SQL. */
export interface Clock { now(): number }
export const systemClock: Clock = { now: () => Date.now() };
export const isoNow = (clock: Clock): string => new Date(clock.now()).toISOString();

/** Anything the DocumentClient can send (commands carry their input). */
export type DdbCommand = { readonly input: object };

export interface Store {
  readonly tables: Tables;
  readonly clock: Clock;
  /** Signs cursors (cursor.ts). Production: a server secret; tests: a constant. */
  readonly secret: string;
  /** The interception point. Resolves to the command's output object. */
  send(command: DdbCommand): Promise<unknown>;
}

export function createStore(opts: { clients: Clients; secret: string; tables?: Tables; clock?: Clock }): Store {
  const { doc } = opts.clients;
  return {
    tables: opts.tables ?? PROD_TABLES,
    clock: opts.clock ?? systemClock,
    secret: opts.secret,
    // Lane SF (G-M26-SF3): the admin record is append-only for every caller of this Store (append-only.ts).
    send: async (command) => { void assertAppendOnly; return doc.send(command as never) as Promise<unknown>; },
  };
}

/** A Store whose `send` runs `around(command, next)` — how the test wrappers hook in. */
export function wrapStore(store: Store, around: (command: DdbCommand, next: (c: DdbCommand) => Promise<unknown>) => Promise<unknown>): Store {
  return { ...store, send: (command) => around(command, (c) => store.send(c)) };
}

type Expr = {
  condition?: string;
  names?: Record<string, string>;
  values?: Record<string, NativeAttributeValue>;
};

function exprParts(e: Expr): Pick<PutCommandInput, 'ConditionExpression' | 'ExpressionAttributeNames' | 'ExpressionAttributeValues'> {
  return {
    ...(e.condition ? { ConditionExpression: e.condition } : {}),
    ...(e.names && Object.keys(e.names).length ? { ExpressionAttributeNames: e.names } : {}),
    ...(e.values && Object.keys(e.values).length ? { ExpressionAttributeValues: e.values } : {}),
  };
}

/** GetItem. `consistent` defaults to TRUE: own-write reads go to the base table, strongly (data-model.md §4). */
export async function get(store: Store, table: TableRole, key: Key, opts: { consistent?: boolean; projection?: string; names?: Record<string, string> } = {}): Promise<Item | undefined> {
  const input: GetCommandInput = {
    TableName: store.tables[table],
    Key: key,
    ConsistentRead: opts.consistent ?? true,
    ...(opts.projection ? { ProjectionExpression: opts.projection } : {}),
    ...(opts.names ? { ExpressionAttributeNames: opts.names } : {}),
  };
  const out = (await store.send(new GetCommand(input))) as { Item?: Item };
  return out.Item;
}

export async function put(store: Store, table: TableRole, item: Item, e: Expr & { returnOld?: boolean } = {}): Promise<Item | undefined> {
  const input: PutCommandInput = { TableName: store.tables[table], Item: item, ...exprParts(e), ...(e.returnOld ? { ReturnValues: 'ALL_OLD' } : {}) };
  const out = (await store.send(new PutCommand(input))) as { Attributes?: Item };
  return out.Attributes;
}

export async function update(store: Store, table: TableRole, key: Key, set: Expr & { update: string; returnValues?: UpdateCommandInput['ReturnValues'] }): Promise<Item | undefined> {
  const input: UpdateCommandInput = {
    TableName: store.tables[table],
    Key: key,
    UpdateExpression: set.update,
    ...exprParts(set),
    ...(set.returnValues ? { ReturnValues: set.returnValues } : {}),
  };
  const out = (await store.send(new UpdateCommand(input))) as UpdateCommandOutput;
  return out.Attributes as Item | undefined;
}

export async function del(store: Store, table: TableRole, key: Key, e: Expr & { returnOld?: boolean } = {}): Promise<Item | undefined> {
  const input: DeleteCommandInput = { TableName: store.tables[table], Key: key, ...exprParts(e), ...(e.returnOld ? { ReturnValues: 'ALL_OLD' } : {}) };
  const out = (await store.send(new DeleteCommand(input))) as { Attributes?: Item };
  return out.Attributes;
}

/** One Query page (≤ 1 MB). Lists that must return "up to N" use paginate.ts, never this alone (FR-009). */
export async function queryPage(store: Store, table: TableRole, input: Omit<QueryCommandInput, 'TableName'>): Promise<QueryCommandOutput> {
  return (await store.send(new QueryCommand({ TableName: store.tables[table], ...input }))) as QueryCommandOutput;
}
