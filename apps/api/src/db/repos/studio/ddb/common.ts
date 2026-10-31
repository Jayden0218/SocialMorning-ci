// Shared pieces of the Studio DynamoDB code: clock, partition reads, listener/episode/show lookups.
/**
 * Every other file in this folder exports `<name>(store, db, ...args)` bodies for `viaStore('st/<file>', …)`
 * (src/db/backend.ts). `db` is the app's handle WITH the Store attached: calling another repo function with it
 * runs that function's DynamoDB body. Expressions are aliased by the account lane's `xo` (reserved words).
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Item, Key, Store, TableRole } from '../../../ddb/store.ts';

export { xo, txa, upd, aput, adel, unlessCondition, type TxA } from '../../account/ddb/common.ts';
export type { Db, Item, Key, Store };

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const nowMs = (store: Store): number => store.clock.now();
export const nowIso = (store: Store): string => new Date(store.clock.now()).toISOString();
export const iso = (v: number | string | Date): string => new Date(v).toISOString();
export const isoOrNull = (v: unknown): string | null => (v === undefined || v === null ? null : new Date(v as string).toISOString());
export const keyOf = (i: Item): Key => ({ PK: String(i['PK']), SK: String(i['SK']) });
export const isUuid = (s: string): boolean => /^[0-9a-f-]{36}$/i.test(s);
export const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
export const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));

/** Every item of a partition (optionally under an SK prefix), strongly consistent, in SK order. */
export async function partition(store: Store, table: TableRole, pk: string, opts: { prefix?: string; from?: string; to?: string; newestFirst?: boolean; max?: number; projection?: string; names?: Record<string, string> } = {}): Promise<Item[]> {
  const conds = ['PK = :pk'];
  const values: Record<string, string> = { ':pk': pk };
  if (opts.prefix !== undefined) { conds.push('begins_with(SK, :pre)'); values[':pre'] = opts.prefix; }
  else if (opts.from !== undefined && opts.to !== undefined) { conds.push('SK BETWEEN :from AND :to'); values[':from'] = opts.from; values[':to'] = opts.to; }
  else if (opts.from !== undefined) { conds.push('SK >= :from'); values[':from'] = opts.from; }
  else if (opts.to !== undefined) { conds.push('SK <= :to'); values[':to'] = opts.to; }
  return (await queryAll(store, table, {
    KeyConditionExpression: conds.join(' AND '), ExpressionAttributeValues: values, ConsistentRead: true,
    ...(opts.newestFirst ? { ScanIndexForward: false } : {}),
    ...(opts.projection ? { ProjectionExpression: opts.projection, ExpressionAttributeNames: opts.names } : {}),
  }, opts.max !== undefined ? { max: opts.max } : {})).items;
}

/** A sparse G4 queue (eventually consistent — jobs and owner pages only), oldest first unless `newestFirst`. */
export async function queue(store: Store, name: string, opts: { to?: string; newestFirst?: boolean; max?: number } = {}): Promise<Item[]> {
  const values: Record<string, string> = { ':q': `Q#${name}` };
  let cond = 'G4PK = :q';
  if (opts.to !== undefined) { cond += ' AND G4SK <= :to'; values[':to'] = opts.to; }
  return (await queryAll(store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: cond, ExpressionAttributeValues: values,
    ...(opts.newestFirst ? { ScanIndexForward: false } : {}),
  }, opts.max !== undefined ? { max: opts.max } : {})).items;
}

/** BatchGet, results in the order of `keys` (missing ones left out). */
export async function getMany(store: Store, table: TableRole, keys: readonly Key[]): Promise<Item[]> {
  if (keys.length === 0) return [];
  const seen = new Set<string>();
  const uniq = keys.filter((k) => (seen.has(`${k.PK}|${k.SK}`) ? false : (seen.add(`${k.PK}|${k.SK}`), true)));
  const found = await batchGetAll(store, table, uniq);
  const by = new Map(found.map((i) => [`${String(i['PK'])}|${String(i['SK'])}`, i]));
  return keys.flatMap((k) => { const i = by.get(`${k.PK}|${k.SK}`); return i ? [i] : []; });
}

/** Listener items by id (lane AC's `L#<id>/PROFILE`), keyed by id. */
export async function listenersById(store: Store, ids: Iterable<string | null | undefined>): Promise<Map<string, Item>> {
  const uniq = [...new Set([...ids].filter((x): x is string => typeof x === 'string' && isUuid(x)))];
  const items = await getMany(store, 'main', uniq.map((id) => K.listener(id)));
  return new Map(items.map((i) => [String(i['id']), i]));
}

/** A listener that may be shown (not suspended, not hidden) — the SQL's `suspended_at IS NULL AND hidden_at IS NULL`. */
export const visible = (l: Item | undefined): l is Item => l !== undefined && !l['suspendedAt'] && !l['hiddenAt'];

/** Episode items by id (lane LB's `EP#<id>/META`), keyed by id. */
export async function episodesById(store: Store, ids: Iterable<string>): Promise<Map<string, Item>> {
  const uniq = [...new Set(ids)];
  const items = await getMany(store, 'main', uniq.map((id) => K.episode(id)));
  return new Map(items.map((i) => [String(i['id']), i]));
}

/** The episodes of a show (lane LB's G2 `SHEPS#<feedKey>`, then their META items), any order. */
export async function showEpisodes(store: Store, feedUrl: string): Promise<Item[]> {
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p', ExpressionAttributeValues: { ':p': `SHEPS#${K.feedKey(feedUrl)}` },
  });
  const metas = await getMany(store, 'main', items.map(keyOf));
  // G2 is eventually consistent: the META read is strong and decides (an episode moved to another feed is not this show's).
  return metas.filter((m) => m['feedUrl'] === feedUrl);
}

/** The newest-first order of the SQL `ORDER BY published_at DESC NULLS LAST, first_seen_at DESC`. */
export function byPublishedDesc(a: Item, b: Item): number {
  const pa = str(a['publishedAt']); const pb = str(b['publishedAt']);
  if (pa !== pb) return pa === null ? 1 : pb === null ? -1 : pb.localeCompare(pa);
  return String(b['firstSeenAt'] ?? '').localeCompare(String(a['firstSeenAt'] ?? ''));
}

/** Runs `fn` over `xs` with at most `n` at once (per-episode and per-listener reads on a big show). */
export async function mapLimit<T, R>(xs: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = Array.from({ length: xs.length }) as R[];
  let next = 0;
  const worker = async () => { for (;;) { const i = next++; if (i >= xs.length) return; out[i] = await fn(xs[i]!); } };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker));
  return out;
}

/**
 * One load shared by the calls of one request that run at the same time (the overview asks for totals, recent
 * comments, recent episodes and six sparklines in one `Promise.all`): the entry lives only while the load is in
 * flight, so a later request always reads afresh.
 */
const inflight = new Map<string, Promise<unknown>>();
export function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = load().finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}
