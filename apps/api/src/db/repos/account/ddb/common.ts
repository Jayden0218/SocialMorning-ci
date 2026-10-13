// Shared pieces of the account lane's DynamoDB code: the clock, key forms, the listener item and session copies.
/**
 * Every function in this folder takes a `Ctx` — the Store plus the `Db` handle that carries it (other lanes' repo
 * functions take that handle) — instead of a `Db`; index.ts adapts them to the switch's `(store, db, ...args)`
 * (src/db/backend.ts `viaStore`).
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { del, get, put, queryPage, update, type Item, type Key, type Store, type TableRole } from '../../../ddb/store.ts';
import { tx, type Tx } from '../../../ddb/tx.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';

/** The Store, and the `Db` handle that carries it. */
export type Ctx = { store: Store; db: Db };

const dbByStore = new WeakMap<Store, Db>();
/** index.ts records which Db a Store runs beside, for the outbox handlers (they are given only the Store). */
export function rememberDb(store: Store, db: Db): void { if (!dbByStore.has(store)) dbByStore.set(store, db); }
export function dbOf(store: Store): Db {
  const db = dbByStore.get(store);
  if (!db) throw new Error('account: this Store has not run beside a Db yet');
  return db;
}

export const nowMs = (h: Ctx | Store): number => ('store' in h ? h.store : h).clock.now();
export const iso = (ms: number): string => new Date(ms).toISOString();
export const DAY_MS = 86_400_000;

/** A token hash (bytes) as the string in a session key. */
export const hashKey = (b: Buffer | Uint8Array | string): string => (typeof b === 'string' ? b : Buffer.from(b).toString('base64url'));

/** The Kuala Lumpur calendar day (UTC+8) of an instant — the day daily_active and status pushes count by. */
export const klDay = (ms: number): string => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);

/**
 * DynamoDB reserves ~570 words (`count`, `scope`, `items`, `token`, `ttl`, `name`, `status` …). Account code
 * writes expressions with plain attribute names and these helpers turn EVERY attribute name into a
 * `#name` placeholder (keywords, `:values` and function names excepted), so no reserved word can slip in.
 */
const KEYWORDS = new Set(['SET', 'REMOVE', 'ADD', 'DELETE', 'AND', 'OR', 'NOT', 'BETWEEN', 'IN']);
export function alias(expr: string | undefined, names: Record<string, string>): string | undefined {
  if (!expr) return expr;
  return expr.replace(/(^|[^:#\w])([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()/g, (m, pre: string, id: string) => {
    if (KEYWORDS.has(id)) return m;
    names[`#${id}`] = id;
    return `${pre}#${id}`;
  });
}

type ExprOpts = { update?: string; condition?: string; names?: Record<string, string>; values?: Record<string, unknown>; label?: string; returnOld?: boolean; returnValues?: 'ALL_NEW' | 'UPDATED_NEW' | 'ALL_OLD' };
/** The same options with every attribute name aliased. */
export function xo<T extends ExprOpts>(o: T): T {
  const n: Record<string, string> = { ...(o.names ?? {}) };
  const out = { ...o, ...(o.update !== undefined ? { update: alias(o.update, n) } : {}), ...(o.condition !== undefined ? { condition: alias(o.condition, n) } : {}) };
  return (Object.keys(n).length ? { ...out, names: n } : out) as T;
}

export const upd = (store: Store, table: TableRole, key: Key, o: ExprOpts & { update: string }) => update(store, table, key, xo(o) as ExprOpts & { update: string });
export const aput = (store: Store, table: TableRole, item: Item, o: ExprOpts = {}) => put(store, table, item, xo(o));
export const adel = (store: Store, table: TableRole, key: Key, o: ExprOpts = {}) => del(store, table, key, xo(o));

/** A transaction whose every expression is aliased (`raw` is the Tx for claimUnique / enqueue / startJob). */
export interface TxA {
  raw: Tx;
  readonly size: number;
  put(table: TableRole, item: Item, o?: ExprOpts): TxA;
  update(table: TableRole, key: Key, o: ExprOpts & { update: string }): TxA;
  delete(table: TableRole, key: Key, o?: ExprOpts): TxA;
  check(table: TableRole, key: Key, o: ExprOpts & { condition: string }): TxA;
  commit(o?: { token?: string }): Promise<void>;
}
export function txa(store: Store): TxA {
  const raw = tx(store);
  const w: TxA = {
    raw,
    get size() { return raw.size; },
    put: (table: TableRole, item: Item, o: ExprOpts = {}) => { raw.put(table, item, xo(o)); return w; },
    update: (table: TableRole, key: Key, o: ExprOpts & { update: string }) => { raw.update(table, key, xo(o) as ExprOpts & { update: string }); return w; },
    delete: (table: TableRole, key: Key, o: ExprOpts = {}) => { raw.delete(table, key, xo(o)); return w; },
    check: (table: TableRole, key: Key, o: ExprOpts & { condition: string }) => { raw.check(table, key, xo(o) as ExprOpts & { condition: string }); return w; },
    commit: (o: { token?: string } = {}) => raw.commit(o),
  };
  return w;
}

/** Swallows a failed condition (the "ON CONFLICT DO NOTHING" / "WHERE … matched no row" outcome). */
export async function unlessCondition<T>(p: Promise<T>): Promise<T | undefined> {
  try { return await p; } catch (e) { if (isConditionFailed(e)) return undefined; throw e; }
}

export type ListenerItem = {
  id: string; email: string; passwordHash: string; displayName: string; createdAt: string;
  failedAttempts?: number; lockedUntil?: string; suspendedAt?: string | null; hiddenAt?: string; deletingAt?: string;
  country?: string; tz?: string; bio?: string; avatarUrl?: string; avatarPath?: string; avatarBytes?: number;
  ageRange?: string; gender?: string; likesPublic?: boolean; privateListening?: boolean; birthday?: string; industry?: string;
  hideBadge?: boolean; hideStickers?: boolean; hideDecorations?: boolean; privateSubscriptions?: boolean; rulesAcceptedAt?: string;
} & Record<string, unknown>;

export async function getListener(h: Ctx, id: string): Promise<ListenerItem | undefined> {
  return (await get(h.store, 'main', K.listener(id))) as ListenerItem | undefined;
}

/** The session-pointer items of a listener (`L#<id>/SESS#<publicId>`), strongly consistent. */
export async function sessionPointers(h: Ctx, listenerId: string): Promise<Item[]> {
  return (await queryAll(h.store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': K.L(listenerId), ':sk': K.LISTENER_SK.sessions },
    ConsistentRead: true,
  })).items;
}

/**
 * The session item copies the listener's email, name, creation time and suspension (data-model.md §3), so
 * the auth check is ONE GetItem. A change to any of them is copied to every live session of the listener.
 */
export async function refreshSessionCopies(h: Ctx, listenerId: string): Promise<void> {
  const l = await getListener(h, listenerId);
  if (!l) return;
  for (const p of await sessionPointers(h, listenerId)) {
    await unlessCondition(upd(h.store, 'main', K.session(String(p['tokenHash'])), {
      update: 'SET email = :e, displayName = :n, listenerCreatedAt = :c, suspendedAt = :s',
      condition: 'attribute_exists(PK)',
      values: { ':e': l.email, ':n': l.displayName, ':c': l.createdAt, ':s': l.suspendedAt ?? null },
    }));
  }
}

/** Every item of a partition with a sort-key prefix, strongly consistent. */
export async function partitionItems(h: Ctx, pk: string, skPrefix?: string, max?: number): Promise<Item[]> {
  return (await queryAll(h.store, 'main', {
    KeyConditionExpression: skPrefix ? 'PK = :pk AND begins_with(SK, :sk)' : 'PK = :pk',
    ExpressionAttributeValues: skPrefix ? { ':pk': pk, ':sk': skPrefix } : { ':pk': pk },
    ConsistentRead: true,
  }, max !== undefined ? { max } : {})).items;
}

/** Newest-first page of a G4 queue (eventually consistent — used only by owner pages and jobs). */
export async function queueNewest(h: Ctx, queue: string, limit: number): Promise<Item[]> {
  return (await queryAll(h.store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': `Q#${queue}` }, ScanIndexForward: false,
  }, { max: limit })).items;
}

/** G4 queue items whose sort time is before `beforeIso`, oldest first. */
export async function queueBefore(h: Ctx, queue: string, beforeIso: string, limit?: number): Promise<Item[]> {
  return (await queryAll(h.store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q AND G4SK < :b', ExpressionAttributeValues: { ':q': `Q#${queue}`, ':b': beforeIso },
  }, limit !== undefined ? { max: limit } : {})).items;
}

export { queryPage };
