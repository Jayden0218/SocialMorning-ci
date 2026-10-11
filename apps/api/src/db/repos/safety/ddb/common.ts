// Shared pieces of lane SF's DynamoDB code: clock, partition and queue reads, batch gets, the Postgres bridge handles.
/**
 * M26 lane SF. Every file in this folder exports `<name>(store, db, ...args)` bodies for `dual('sf/<file>', …)`
 * (src/db/backend.ts). `db` is the app's handle WITH the Store attached; `bridgeOf(db)` is the plain Postgres
 * handle while the write bridge is on (the lanes still on Postgres JOIN `blocks`, `reports`,
 * `moderation_actions`, `hidden_feeds` — data-model.md "Lane SF changes"), and `pgOf(db)` is the plain handle
 * for reading tables of lanes not moved yet (foreign.ts). Calling a dual function with a plain handle runs its
 * Postgres body.
 * Expressions are written with plain attribute names and aliased by lane AC's `xo` (reserved words).
 */
import type { Db } from '../../../db.ts';
import { bridgeOf, pgOf } from '../../../backend-ddb.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll, countAll } from '../../../ddb/paginate.ts';
import type { Item, Key, Store, TableRole } from '../../../ddb/store.ts';

export { xo, txa, upd, aput, adel, unlessCondition, type TxA } from '../../account/ddb/common.ts';
export { bridgeOf, pgOf };

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const nowMs = (store: Store): number => store.clock.now();
export const nowIso = (store: Store): string => new Date(store.clock.now()).toISOString();
export const iso = (ms: number): string => new Date(ms).toISOString();
export const keyOf = (i: Item): Key => ({ PK: String(i['PK']), SK: String(i['SK']) });
export const isUuid = (s: string): boolean => /^[0-9a-f-]{36}$/i.test(s);

/** Every item of a partition (optionally under an SK prefix), strongly consistent, in SK order. */
export async function partition(store: Store, table: TableRole, pk: string, opts: { prefix?: string; from?: string; to?: string; newestFirst?: boolean; max?: number } = {}): Promise<Item[]> {
  const conds = ['PK = :pk'];
  const values: Record<string, string> = { ':pk': pk };
  if (opts.prefix !== undefined) { conds.push('begins_with(SK, :pre)'); values[':pre'] = opts.prefix; }
  else if (opts.from !== undefined && opts.to !== undefined) { conds.push('SK BETWEEN :from AND :to'); values[':from'] = opts.from; values[':to'] = opts.to; }
  else if (opts.from !== undefined) { conds.push('SK >= :from'); values[':from'] = opts.from; }
  else if (opts.to !== undefined) { conds.push('SK <= :to'); values[':to'] = opts.to; }
  return (await queryAll(store, table, {
    KeyConditionExpression: conds.join(' AND '), ExpressionAttributeValues: values, ConsistentRead: true,
    ...(opts.newestFirst ? { ScanIndexForward: false } : {}),
  }, opts.max !== undefined ? { max: opts.max } : {})).items;
}

/** A sparse G4 queue (eventually consistent — owner pages, counts and jobs only), oldest first unless `newestFirst`. `from`/`to` bound G4SK, inclusive. */
export async function queue(store: Store, name: string, opts: { from?: string; to?: string; newestFirst?: boolean; max?: number } = {}): Promise<Item[]> {
  const values: Record<string, string> = { ':q': `Q#${name}` };
  let cond = 'G4PK = :q';
  if (opts.from !== undefined && opts.to !== undefined) { cond += ' AND G4SK BETWEEN :from AND :to'; values[':from'] = opts.from; values[':to'] = opts.to; }
  else if (opts.from !== undefined) { cond += ' AND G4SK >= :from'; values[':from'] = opts.from; }
  else if (opts.to !== undefined) { cond += ' AND G4SK <= :to'; values[':to'] = opts.to; }
  return (await queryAll(store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: cond, ExpressionAttributeValues: values,
    ...(opts.newestFirst ? { ScanIndexForward: false } : {}),
  }, opts.max !== undefined ? { max: opts.max } : {})).items;
}

export async function queueCount(store: Store, name: string): Promise<number> {
  return countAll(store, 'main', { IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': `Q#${name}` } });
}

/** The items of a G5 reference (KEYS_ONLY), read back from the table. */
export async function byRef(store: Store, kind: string, value: string, opts: { from?: string; newestFirst?: boolean; max?: number } = {}): Promise<Item[]> {
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G5,
    KeyConditionExpression: opts.from ? 'G5PK = :r AND G5SK >= :from' : 'G5PK = :r',
    ExpressionAttributeValues: opts.from ? { ':r': `REF#${kind}#${value}`, ':from': opts.from } : { ':r': `REF#${kind}#${value}` },
    ...(opts.newestFirst ? { ScanIndexForward: false } : {}),
  }, opts.max !== undefined ? { max: opts.max } : {});
  return getMany(store, 'main', items.map(keyOf));
}

/** BatchGet, results in the order of `keys` (missing ones left out). */
export async function getMany(store: Store, table: TableRole, keys: readonly Key[]): Promise<Item[]> {
  if (keys.length === 0) return [];
  const found = await batchGetAll(store, table, keys);
  const by = new Map(found.map((i) => [`${String(i['PK'])}|${String(i['SK'])}`, i]));
  return keys.flatMap((k) => { const i = by.get(`${k.PK}|${k.SK}`); return i ? [i] : []; });
}

/** Listener items by id (lane AC's `L#<id>/PROFILE`), as a map. */
export async function listenersById(store: Store, ids: readonly string[]): Promise<Map<string, Item>> {
  const uniq = [...new Set(ids.filter((x) => x && isUuid(x)))];
  const items = await getMany(store, 'main', uniq.map((id) => K.listener(id)));
  return new Map(items.map((i) => [String(i['id']), i]));
}

/** jsonb-ish values: an object stays, a JSON string is parsed once (the M14 lesson), anything else → {}. */
export const obj = (v: unknown): Record<string, unknown> => {
  const x = typeof v === 'string' ? (() => { try { return JSON.parse(v) as unknown; } catch { return v; } })() : v;
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
};

export type { Db, Item, Key, Store };
