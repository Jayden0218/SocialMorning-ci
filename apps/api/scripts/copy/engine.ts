// The copy engine: pages every lane source out of Postgres, writes the items with BatchWrite, resumable; and reads all items back.
/**
 * M26 lane MIG (MIG-01, MIG-02, MIG-04). Used by copy-to-ddb.ts, count-check.ts, copy-back.ts and test/ddb-mig.test.ts.
 *
 * - Sources are read with a keyset cursor over their `keys` (compared as text: a total order is all a cursor
 *   needs), `pageSize` rows at a time. During the cutover the database is frozen, so the pages are stable.
 * - Each page's items are deduplicated and written 25 at a time (batch.ts re-sends `UnprocessedItems`); an
 *   `AUDIT#` item is a conditional Put (append-only, append-only.ts) and an existing one is left alone.
 * - Idempotent: every item is a whole Put of a value computed from the rows only, so a second run writes the same
 *   items again. A key emitted twice in one run must carry the same value — otherwise two sources disagree and the
 *   run stops naming both.
 * - Resumable: the state (sources done, the cursor of the one in progress) is saved after every page.
 * - Prints counts only, never a row.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../../src/db/db.ts';
import { batchWriteAll, type WriteRequest } from '../../src/db/ddb/batch.ts';
import type { Item, Store, TableRole } from '../../src/db/ddb/store.ts';
import type { Ctx, ItemIndex, LaneModule, Out, Row, Source } from './types.ts';

export const TABLE_ROLES: readonly TableRole[] = ['main', 'events', 'cache'];

const quote = (c: string) => `"${c.replace(/"/g, '""')}"`;

/** One page of a source after `after` (the keys of the last row seen), in key order. */
export async function readPage(pg: Db, src: Source, after: string[] | undefined, limit: number): Promise<Row[]> {
  const ks = src.keys.map((k) => `s.${quote(k)}::text`);
  const tuple = ks.length === 1 ? ks[0]! : `(${ks.join(', ')})`;
  const params = after ?? [];
  const ph = after ? (after.length === 1 ? '$1::text' : `(${after.map((_, i) => `$${i + 1}::text`).join(', ')})`) : '';
  // New lines around the source: a trailing `-- comment` in it must not swallow the wrapper.
  const inner = src.sql.trim().replace(/;\s*$/, '');
  const sql = `SELECT * FROM (\n${inner}\n) s ${after ? `WHERE ${tuple} > ${ph}` : ''} ORDER BY ${ks.join(', ')} LIMIT ${Math.trunc(limit)}`;
  try {
    return await pg.query<Row>(sql, params);
  } catch (e) {
    throw new Error(`copy: source ${src.name} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const keyText = (src: Source, r: Row): string[] => src.keys.map((k) => {
  const v = r[k];
  if (v === null || v === undefined) throw new Error(`copy: source ${src.name} has a NULL key column ${k} (keys must be NOT NULL)`);
  if (v instanceof Date) throw new Error(`copy: source ${src.name} key ${k} is a timestamp; select a text/uuid/int key (cursor compares as text)`);
  if (v instanceof Uint8Array) return `\\x${Buffer.from(v).toString('hex')}`;
  return String(v);
});

/** Canonical text of an item (sets sorted, binary as base64) — equal items give equal text. */
export function canonical(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (x instanceof Uint8Array) return { $b: Buffer.from(x).toString('base64') };
    if (x instanceof Set) return { $s: [...x].map((e) => String(e)).sort() };
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, norm((x as Record<string, unknown>)[k])]));
    return x;
  };
  return JSON.stringify(norm(v));
}
const digest = (s: string) => createHash('sha256').update(s).digest('base64').slice(0, 22);
export const itemKeyText = (table: TableRole, it: Item) => `${table}|${String(it['PK'])}|${String(it['SK'])}`;

export type CopyState = { done: string[]; cursors: Record<string, string[]>; rows: Record<string, number>; items: Record<string, number> };
export const emptyState = (): CopyState => ({ done: [], cursors: {}, rows: {}, items: {} });

export function loadState(file: string | undefined): CopyState {
  if (!file || !existsSync(file)) return emptyState();
  return { ...emptyState(), ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<CopyState>) };
}
export function saveState(file: string | undefined, s: CopyState): void {
  if (file) writeFileSync(file, `${JSON.stringify(s, null, 1)}\n`, { mode: 0o600 });
}

export type CopyOpts = {
  pg: Db;
  store: Store;
  modules: readonly LaneModule[];
  /** Only these sources (names); default all. */
  only?: readonly string[];
  /** Leave these sources out (the guard G-M26-MIG1 drops one this way). */
  skip?: readonly string[];
  /** Resume state file (copy-to-ddb.ts `--state`). */
  stateFile?: string;
  pageSize?: number;
  /** In-flight BatchWrite calls. */
  parallel?: number;
  log?: (line: string) => void;
  /** Collect the items instead of writing them (copy-back's "what T0 looked like"). */
  collect?: Map<string, { table: TableRole; item: Item; source: string }>;
};

export type CopyResult = { rows: Record<string, number>; items: Record<string, number>; totalItems: number; sources: number };

/** Every source of every module, in module order (parents before children: the registry's order). */
export function allSources(modules: readonly LaneModule[]): Source[] {
  const out: Source[] = [];
  const seen = new Set<string>();
  for (const m of modules) for (const t of m.tables) for (const s of t.sources) {
    if (seen.has(s.name)) throw new Error(`copy: two sources are named ${s.name}`);
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

async function inParallel<T>(xs: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const run = async () => { while (i < xs.length) { const x = xs[i++]!; await fn(x); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, xs.length)) }, run));
}

async function createOnly(store: Store, table: TableRole, item: Item): Promise<void> {
  try {
    await store.send(new PutCommand({ TableName: store.tables[table], Item: item, ConditionExpression: 'attribute_not_exists(PK)' }));
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e;
  }
}

export async function copyToDdb(o: CopyOpts): Promise<CopyResult> {
  const log = o.log ?? (() => undefined);
  const pageSize = o.pageSize ?? 500;
  const state = o.collect ? emptyState() : loadState(o.stateFile);
  const seen = new Map<string, { hash: string; source: string }>();
  const ctx: Ctx = { pg: o.pg, store: o.store };
  const sources = allSources(o.modules).filter((s) => (!o.only || o.only.includes(s.name)) && !(o.skip ?? []).includes(s.name));
  for (const src of sources) {
    if (state.done.includes(src.name)) { log(`skip ${src.name} (done in an earlier run)`); continue; }
    let after = state.cursors[src.name];
    let prevKey: string | undefined;
    for (;;) {
      const rows = await readPage(o.pg, src, after, pageSize);
      if (rows.length === 0) break;
      const outs: Out[] = [];
      for (const r of rows) {
        const k = JSON.stringify(keyText(src, r));
        if (k === prevKey) throw new Error(`copy: source ${src.name} keys are not unique (two rows share one cursor key)`);
        prevKey = k;
        try { outs.push(...await src.map(r, ctx)); } catch (e) {
          throw new Error(`copy: source ${src.name} map failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // Dedupe within the run: one key, one value.
      const byTable: Record<TableRole, Map<string, Item>> = { main: new Map(), events: new Map(), cache: new Map() };
      const creates: { table: TableRole; item: Item }[] = [];
      for (const out of outs) {
        if (typeof out.item['PK'] !== 'string' || typeof out.item['SK'] !== 'string' || typeof out.item['t'] !== 'string') {
          throw new Error(`copy: source ${src.name} emitted an item without PK/SK/t (build it with the lane's builder or encode)`);
        }
        const key = itemKeyText(out.table, out.item);
        const hash = digest(canonical(out.item));
        const had = seen.get(key);
        if (had) {
          if (had.hash !== hash) throw new Error(`copy: sources ${had.source} and ${src.name} write different values to one ${String(out.item['t'])} item (${String(out.item['PK']).split('#')[0]}#…)`);
          continue;
        }
        seen.set(key, { hash, source: src.name });
        if (o.collect) { o.collect.set(key, { table: out.table, item: out.item, source: src.name }); continue; }
        if (out.create) creates.push({ table: out.table, item: out.item });
        else byTable[out.table].set(key, out.item);
      }
      if (!o.collect) {
        const jobs: { table: TableRole; reqs: WriteRequest[] }[] = [];
        for (const table of TABLE_ROLES) {
          const items = [...byTable[table].values()];
          for (let i = 0; i < items.length; i += 25) jobs.push({ table, reqs: items.slice(i, i + 25).map((put) => ({ put })) });
        }
        await inParallel(jobs, o.parallel ?? 8, (j) => batchWriteAll(o.store, j.table, j.reqs));
        for (const c of creates) await createOnly(o.store, c.table, c.item);
      }
      state.rows[src.name] = (state.rows[src.name] ?? 0) + rows.length;
      state.items[src.name] = (state.items[src.name] ?? 0) + outs.length;
      after = keyText(src, rows[rows.length - 1]!);
      state.cursors[src.name] = after;
      if (!o.collect) saveState(o.stateFile, state);
      if (rows.length < pageSize) break;
    }
    state.done.push(src.name);
    delete state.cursors[src.name];
    if (!o.collect) saveState(o.stateFile, state);
    log(`copied ${src.name}: ${state.rows[src.name] ?? 0} rows → ${state.items[src.name] ?? 0} items`);
  }
  const totalItems = Object.values(state.items).reduce((a, b) => a + b, 0);
  return { rows: state.rows, items: state.items, totalItems, sources: sources.length };
}

/** Every item of the three tables (a Scan: scripts only, never the API — the lint rule covers src/). */
export async function scanTable(store: Store, table: TableRole): Promise<Item[]> {
  const out: Item[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = (await store.send(new ScanCommand({ TableName: store.tables[table], ConsistentRead: true, ...(start ? { ExclusiveStartKey: start } : {}) }))) as {
      Items?: Item[]; LastEvaluatedKey?: Record<string, unknown>;
    };
    out.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return out;
}

export async function readAll(store: Store): Promise<ItemIndex> {
  const all: (Item & { _table: TableRole })[] = [];
  for (const table of TABLE_ROLES) for (const it of await scanTable(store, table)) all.push(Object.assign(it, { _table: table }));
  return indexItems(all);
}

export function indexItems(all: (Item & { _table: TableRole })[]): ItemIndex {
  const byType = new Map<string, Item[]>();
  const byKey = new Map<string, Item>();
  const byPart = new Map<string, Item[]>();
  for (const it of all) {
    const t = String(it['t']);
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(it);
    byKey.set(`${it._table}|${String(it['PK'])}|${String(it['SK'])}`, it);
    const pk = `${it._table}|${String(it['PK'])}`;
    (byPart.get(pk) ?? byPart.set(pk, []).get(pk)!).push(it);
  }
  for (const xs of byPart.values()) xs.sort((a, b) => (String(a['SK']) < String(b['SK']) ? -1 : String(a['SK']) > String(b['SK']) ? 1 : 0));
  return {
    all,
    ofType: (t) => byType.get(t) ?? [],
    get: (table, PK, SK) => byKey.get(`${table}|${PK}|${SK}`),
    partition: (table, PK) => byPart.get(`${table}|${PK}`) ?? [],
  };
}

/** A key safe to print: ids stay, anything that looks like an email or a URL is replaced. */
export function safeKey(s: string): string {
  return s.replace(/[^#|]*@[^#|]*/g, '<email>').replace(/https?:\/\/[^#|]*/g, '<url>');
}
