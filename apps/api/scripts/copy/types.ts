// The shapes every lane's copy module fills in: Postgres sources → DynamoDB items, count rules, counter checks, the way back.
/**
 * M26 lane MIG (tasks.md MIG-01…04, data-model.md §15). One module per domain lane (`scripts/copy/<lane>.ts`) exports
 * `tables: TableSpec[]` and `counters: CounterCheck[]`. The engine (engine.ts) reads every source page by page from
 * the frozen Postgres, turns each row into the items the lane's OWN code writes (its item builders, else keys.ts +
 * codec.ts `encode` — so a STRICT allowlist refuses a wrong attribute), and BatchWrites them.
 *
 * Rules every module keeps (the engine checks the ones it can):
 * - **Deterministic.** An item depends only on the Postgres rows: no `Date.now()`, no random ids, no clock. The copy
 *   run twice gives the same items (MIG test step 5); a key emitted twice in one run must be byte-equal (engine).
 * - **One writer per key.** A shared item (listener PROFILE, show META, episode META, `CFG#bytes`) is built whole by
 *   ONE source, with SQL sub-selects for the attributes other lanes keep on it.
 * - **Put only.** Counters are computed in SQL and stored, never `ADD`ed (idempotent). The only conditional write is
 *   an `AUDIT#` item (append-only: `create: true`).
 * - **Never print a person's data.** Counts and ids only.
 */
import type { Db } from '../../src/db/db.ts';
import type { ItemType } from '../../src/db/ddb/codec.ts';
import type { Item, Store, TableRole } from '../../src/db/ddb/store.ts';

export type Row = Record<string, unknown>;

/** One item to write. `create`: a conditional Put (`attribute_not_exists(PK)`), an existing item is left as it is. */
export type Out = { table: TableRole; item: Item; create?: boolean };

export type Ctx = {
  /** The frozen Postgres (read only). */
  pg: Db;
  /** The target Store: table names only — a module never writes through it. */
  store: Store;
};

/** One read of Postgres. `sql` may JOIN, aggregate and sub-select; the engine pages it by `keys`. */
export type Source = {
  /** Unique across all modules; the state file and the printed counts use it (e.g. `ac.listeners`). */
  name: string;
  /**
   * A SELECT whose output columns include every name in `keys`. Write dates as `col::text` when the value is a
   * `date`, bigints/numerics as `::text` or `::float8` (drivers differ), timestamps as they are (Date).
   */
  sql: string;
  /** Output columns forming a total, unique order: the keyset cursor (compared as text). */
  keys: string[];
  map(row: Row, ctx: Ctx): Out[] | Promise<Out[]>;
};

/** How count-check compares one Postgres count with one set of items. */
export type CountSpec = {
  /** A short label printed on a mismatch (default: `<pgTable> → <type>`). */
  label?: string;
  /** The item type `t` counted (or give `measure`). */
  type?: ItemType;
  /** Only items whose PK / SK start with these. */
  pk?: string;
  sk?: string;
  where?: (item: Item) => boolean;
  /**
   * Instead of counting items: a number read from the items, for rows that live INSIDE an item (a document's list,
   * a poll's options, the 100 heat buckets) — e.g. the sum of `options.length` over poll items.
   */
  measure?: (ix: ItemIndex) => number;
  /** The Postgres count; default `SELECT count(*)::int AS n FROM <pgTable>`. Must return one row with `n`. */
  sql?: string;
};

/** How copy-back turns one primary item into its Postgres row(s) (the way back, MIG-04). */
export type BackSpec = {
  /** The parent table the row goes to, and its primary-key columns (the upsert's conflict target, the delete's match). */
  pgTable: string;
  pk: string[];
  /** Which items are this table's rows (usually `t === type`, sometimes with a key prefix). */
  match(item: Item): boolean;
  /** The row: column → value (Postgres casts it; dates as ISO strings, jsonb as objects, bytea as Buffer). */
  toRow(item: Item): Row;
  /** Child rows held inside the item (e.g. a document's list): replaced whole — DELETE … WHERE match, then INSERT. */
  children?(item: Item): { table: string; match: Row; rows: Row[] }[];
  /**
   * Lane LE: the WHOLE table from every matching item (a table held in one or a few items: admins, blocked words, host
   * picks). When the matching items differ from T0 at all — including a list emptied or an item deleted — every row
   * here is upserted and every Postgres row whose `pk` is not among them is deleted (row by row, so a trigger that
   * refuses emptying a table in one statement still sees the rows it needs). `toRow` / `children` are then unused.
   */
  whole?(items: readonly Item[]): Row[];
};

export type TableSpec = {
  /** The Postgres table (Appendix A of data-model.md). Every table of the database must have a spec. */
  pgTable: string;
  /** Why nothing is copied (legacy, build buffer, derived elsewhere). Then `sources` / `counts` may be empty. */
  skip?: string;
  sources: Source[];
  counts: CountSpec[];
  back?: BackSpec[];
};

/** Items read back for the counter checks: all three tables, held in memory (fine at ~10⁵ items; see the runbook). */
export type ItemIndex = {
  all: readonly (Item & { _table: TableRole })[];
  ofType(t: ItemType): readonly Item[];
  get(table: TableRole, PK: string, SK: string): Item | undefined;
  /** Every item of one partition, in SK order. */
  partition(table: TableRole, PK: string): readonly Item[];
};

export type Mismatch = { counter: string; key: string; stored: unknown; recomputed: unknown };

/** One counter kept on an item, recomputed from the items it counts. Must be read-only. */
export type CounterCheck = { name: string; check(ix: ItemIndex): Mismatch[] | Promise<Mismatch[]> };

export type LaneModule = { lane: string; tables: TableSpec[]; counters: CounterCheck[] };

// ---- value helpers for map() (Postgres drivers differ: postgres.js vs PGlite) ----

/** ISO-8601 with milliseconds, or null. Accepts Date, ISO/Postgres timestamp text, ms. */
export function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : typeof v === 'number' ? new Date(v) : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`copy: not a time: ${String(v)}`);
  return d.toISOString();
}
/** `iso` for a value that must be there. */
export function isoReq(v: unknown): string {
  const s = iso(v);
  if (s === null) throw new Error('copy: a required time is NULL');
  return s;
}
/** A `date` column as `yyyy-mm-dd` (select it as `col::text`; a Date is read in UTC). */
export function dayOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
/** A number (int/bigint/numeric/text), or null. Refuses NaN and values beyond 2^53. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  if (!Number.isFinite(n)) throw new Error(`copy: not a number: ${String(v)}`);
  if (Number.isInteger(n) && !Number.isSafeInteger(n)) throw new Error(`copy: beyond 2^53: ${String(v)}`);
  return n;
}
export function numReq(v: unknown): number {
  const n = num(v);
  if (n === null) throw new Error('copy: a required number is NULL');
  return n;
}
/** jsonb: drivers give an object; a double-encoded value (M12/M31 repairs) comes back as a string. */
export function json<T = unknown>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return v as T; } }
  return v as T;
}
/** bytea → Buffer (postgres.js gives a Buffer, PGlite a Uint8Array). */
export function bytes(v: unknown): Buffer | null {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  if (typeof v === 'string' && v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex');
  throw new Error('copy: not bytea');
}
export const bool = (v: unknown): boolean => v === true || v === 't' || v === 'true' || v === 1;
export const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
/** Postgres text[] / int[]: drivers give an array; a literal `{a,b}` is parsed. */
export function arr<T = string>(v: unknown): T[] | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v as T[];
  const s = String(v);
  if (s === '{}') return [];
  return s.replace(/^\{|\}$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')) as T[];
}
/** Epoch SECONDS for a TTL backstop, `afterMs` after a time (deterministic: from the row, never from now). */
export const ttlFrom = (t: unknown, afterMs: number): number => Math.floor((Date.parse(isoReq(t)) + afterMs) / 1000);
