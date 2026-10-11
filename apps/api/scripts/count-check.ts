// After the copy: every Postgres table's row count against its items, and every counter recomputed from the items it counts. Exit 1 on any difference.
/**
 * M26 lane MIG, MIG-02 (spec SC-02, plan.md "Cutover" step 4 — the M23 restore method: counts, not samples).
 *
 * 1. Every table of the Postgres database must have a copy spec (scripts/copy/<lane>.ts) — a table added later and
 *    never mapped fails here, by name.
 * 2. Per spec: Postgres `count(*)` (or the spec's SQL) = the number of items of its type (or the spec's measure).
 * 3. Every counter a lane keeps on an item (comment likes and replies, episode comment counts, follower and
 *    subscriber counts, heat buckets, poll votes, Studio and dashboard rollups, byte ceilings, sequences) is
 *    recomputed from the items it counts and compared with the stored value.
 * Prints table names, counter names, counts and item keys (ids) only.
 *
 *   cd apps/api && DATABASE_URL=… DDB_ENDPOINT=… npx tsx scripts/count-check.ts --prefix rehearsal1   (or --prod --aws)
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { Db } from '../src/db/db.ts';
import type { Store } from '../src/db/ddb/store.ts';
import { readAll, safeKey } from './copy/engine.ts';
import { connect, parseArgs } from './copy/connect.ts';
import { MODULES } from './copy/registry.ts';
import type { CountSpec, ItemIndex, LaneModule, Mismatch } from './copy/types.ts';

export type CheckFailure =
  | { kind: 'unmapped'; table: string }
  | { kind: 'table'; table: string; label: string; postgres: number; dynamodb: number }
  | { kind: 'counter'; counter: string; key: string; stored: unknown; recomputed: unknown }
  | { kind: 'error'; where: string; message: string };
export type CheckResult = { ok: boolean; tables: number; counts: number; counters: number; failures: CheckFailure[] };

export function countItems(ix: ItemIndex, c: CountSpec): number {
  if (c.measure) return c.measure(ix);
  if (!c.type) throw new Error('a CountSpec needs a type or a measure');
  return ix.ofType(c.type).filter((it) =>
    (!c.pk || String(it['PK']).startsWith(c.pk)) && (!c.sk || String(it['SK']).startsWith(c.sk)) && (!c.where || c.where(it))).length;
}

export async function countCheck(o: { pg: Db; store: Store; modules?: readonly LaneModule[]; ix?: ItemIndex; log?: (l: string) => void }): Promise<CheckResult> {
  const log = o.log ?? (() => undefined);
  const modules = o.modules ?? MODULES;
  const failures: CheckFailure[] = [];
  const ix = o.ix ?? await readAll(o.store);
  const specs = modules.flatMap((m) => m.tables);
  const mapped = new Set(specs.map((s) => s.pgTable));
  const tables = await o.pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  for (const t of tables) {
    if (!mapped.has(t.table_name)) { failures.push({ kind: 'unmapped', table: t.table_name }); log(`UNMAPPED table ${t.table_name}: no copy spec`); }
  }
  let counts = 0;
  for (const spec of specs) {
    if (spec.skip) { log(`skip  ${spec.pgTable}: ${spec.skip}`); continue; }
    if (spec.counts.length === 0) failures.push({ kind: 'error', where: spec.pgTable, message: 'a copied table has no count rule' });
    for (const c of spec.counts) {
      counts++;
      const label = c.label ?? `${spec.pgTable} → ${c.type ?? 'measure'}`;
      try {
        const [row] = await o.pg.query<{ n: unknown }>(c.sql ?? `SELECT count(*)::int AS n FROM ${spec.pgTable}`);
        const pgN = Number(row?.n ?? 0);
        const ddbN = countItems(ix, c);
        if (pgN !== ddbN) {
          failures.push({ kind: 'table', table: spec.pgTable, label, postgres: pgN, dynamodb: ddbN });
          log(`MISMATCH table ${spec.pgTable} (${label}): postgres ${pgN}, dynamodb ${ddbN}`);
        } else log(`ok    ${label}: ${pgN}`);
      } catch (e) {
        failures.push({ kind: 'error', where: label, message: e instanceof Error ? e.message : String(e) });
        log(`ERROR ${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  let counters = 0;
  for (const m of modules) for (const cc of m.counters) {
    counters++;
    let bad: Mismatch[];
    try { bad = await cc.check(ix); } catch (e) {
      failures.push({ kind: 'error', where: cc.name, message: e instanceof Error ? e.message : String(e) });
      log(`ERROR counter ${cc.name}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const b of bad) {
      failures.push({ kind: 'counter', counter: b.counter, key: safeKey(b.key), stored: b.stored, recomputed: b.recomputed });
      log(`MISMATCH counter ${b.counter} at ${safeKey(b.key)}: stored ${JSON.stringify(b.stored)}, recomputed ${JSON.stringify(b.recomputed)}`);
    }
    if (bad.length === 0) log(`ok    counter ${cc.name}`);
  }
  return { ok: failures.length === 0, tables: specs.length, counts, counters, failures };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const c = await connect(args);
  try {
    const r = await countCheck({ pg: c.pg, store: c.store, log: (l) => console.log(l) });
    console.log(`count-check: ${r.tables} tables, ${r.counts} counts, ${r.counters} counter checks — ${r.failures.length} failures`);
    process.exitCode = r.ok ? 0 : 1;
  } finally {
    await c.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); });
}
