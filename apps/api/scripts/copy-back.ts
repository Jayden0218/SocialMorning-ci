// The way back (within 7 days of cutover): every DynamoDB change made since the copy, written back into the frozen Postgres.
/**
 * M26 lane MIG, MIG-04 (plan.md "Cutover" step 7; runbook docs/runbooks/m26-cutover.md "Rollback").
 *
 * What changed since T0 is found by DIFFERENCE, not by timestamps: the frozen Postgres is exactly T0, so the copy's
 * own mapping run over it (in memory, nothing written) gives the items T0 had; a full read of the DynamoDB tables
 * gives the items now. For every lane's primary item type (its `back` spec):
 *   - an item now that T0 did not have, or with a different value → its row is upserted (children replaced);
 *   - an item T0 had that is gone now → its row is deleted.
 * This needs no `updatedAt` on every item and no delete log, and it cannot miss a write: anything that changed an
 * item shows up. Derived Postgres state is rebuilt afterwards: the heat curves of touched episodes, and the
 * bigserial sequences moved past the largest id.
 *
 * All of it runs in ONE Postgres transaction (all or nothing). Prints per table: upserted / deleted, counts only.
 *
 *   cd apps/api && DATABASE_URL=<the frozen Neon branch> DDB_ENDPOINT=… npx tsx scripts/copy-back.ts --prefix <set> [--dry]
 *   … --prod --aws  (the owner's AWS account — runbook)
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { Db } from '../src/db/db.ts';
import type { Item, Store, TableRole } from '../src/db/ddb/store.ts';
import { rebuildEpisodeHeat } from '../src/heat/rebuild.ts';
import { canonical, copyToDdb, itemKeyText, readAll } from './copy/engine.ts';
import { connect, parseArgs } from './copy/connect.ts';
import { MODULES } from './copy/registry.ts';
import type { BackSpec, ItemIndex, LaneModule, Row } from './copy/types.ts';

export type BackResult = { upserted: Record<string, number>; deleted: Record<string, number>; episodes: number };

type Col = { name: string; type: string };

async function columnsOf(db: Db, table: string): Promise<Map<string, Col>> {
  const rows = await db.query<{ name: string; type: string }>(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped`, [table]);
  return new Map(rows.map((r) => [r.name, r]));
}

const arrayLiteral = (xs: unknown[]): string => `{${xs.map((x) => (x === null ? 'NULL' : `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)).join(',')}}`;

/** A parameter and its placeholder for one column value (Postgres casts it to the column's type). */
function param(col: Col, v: unknown, n: number): { ph: string; value: unknown } {
  if (v === null || v === undefined) return { ph: `$${n}::${col.type}`, value: null };
  if (col.type === 'bytea') return { ph: `$${n}::bytea`, value: Buffer.isBuffer(v) ? v : Buffer.from(v as Uint8Array) };
  if (col.type === 'jsonb' || col.type === 'json') return { ph: `($${n}::text)::${col.type}`, value: JSON.stringify(v) };
  if (col.type.endsWith('[]')) return { ph: `($${n}::text)::${col.type}`, value: arrayLiteral(Array.isArray(v) ? v : [...(v as Set<unknown>)]) };
  if (v instanceof Date) return { ph: `($${n}::text)::${col.type}`, value: v.toISOString() };
  return { ph: `($${n}::text)::${col.type}`, value: String(v) };
}

async function upsert(db: Db, table: string, cols: Map<string, Col>, pk: string[], row: Row): Promise<void> {
  const names = Object.keys(row).filter((k) => row[k] !== undefined);
  for (const k of names) if (!cols.has(k)) throw new Error(`copy-back: ${table} has no column ${k}`);
  const ps = names.map((k, i) => param(cols.get(k)!, row[k], i + 1));
  const set = names.filter((k) => !pk.includes(k));
  await db.query(
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${ps.map((p) => p.ph).join(', ')})
     ON CONFLICT (${pk.join(', ')}) DO ${set.length ? `UPDATE SET ${set.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}` : 'NOTHING'}`,
    ps.map((p) => p.value));
}

async function deleteWhere(db: Db, table: string, cols: Map<string, Col>, match: Row): Promise<void> {
  const names = Object.keys(match);
  const ps = names.map((k, i) => {
    const c = cols.get(k);
    if (!c) throw new Error(`copy-back: ${table} has no column ${k}`);
    return param(c, match[k], i + 1);
  });
  await db.query(`DELETE FROM ${table} WHERE ${names.map((k, i) => `${k} = ${ps[i]!.ph}`).join(' AND ')}`, ps.map((p) => p.value));
}

/** The 7 former bigserial tables: their sequences go past the largest id copied back. */
const SERIAL_TABLES = ['activity', 'rec_events', 'subscription_events', 'share_events', 'admin_audit', 'chat_messages', 'list_overrides'];

export async function copyBack(o: { pg: Db; store: Store; modules?: readonly LaneModule[]; dry?: boolean; ix?: ItemIndex; log?: (l: string) => void }): Promise<BackResult> {
  const log = o.log ?? (() => undefined);
  const modules = o.modules ?? MODULES;
  // T0: what the copy makes of the frozen Postgres (nothing written).
  const t0 = new Map<string, { table: TableRole; item: Item; source: string }>();
  await copyToDdb({ pg: o.pg, store: o.store, modules, collect: t0 });
  const now = o.ix ?? await readAll(o.store);
  const nowByKey = new Map(now.all.map((it) => [itemKeyText(it._table, it), it]));
  const specs: BackSpec[] = modules.flatMap((m) => m.tables.flatMap((t) => t.back ?? []));
  const upserted: Record<string, number> = {};
  const deleted: Record<string, number> = {};
  const episodes = new Set<string>();
  const touch = (it: Item) => { if (typeof it['episodeId'] === 'string') episodes.add(it['episodeId']); };
  const plan: { spec: BackSpec; up: Item[]; gone: Item[] }[] = [];
  // Lane LE: tables rebuilt whole (BackSpec.whole) — compared as one set of items, so an emptied list is seen too.
  const wholePlan: { spec: BackSpec; rows: Row[] }[] = [];
  for (const spec of specs.filter((x) => x.whole)) {
    const strip = (it: Item) => { const { _table, ...plain } = it as Item & { _table?: TableRole }; void _table; return plain; };
    const nowItems = now.all.filter((it) => spec.match(it)).map(strip);
    const t0Items = [...t0.values()].filter((w) => spec.match(w.item)).map((w) => w.item);
    const key = (xs: Item[]) => xs.map((x) => canonical(x)).sort().join('\n');
    if (key(nowItems) !== key(t0Items)) wholePlan.push({ spec, rows: spec.whole!(nowItems) });
  }
  for (const spec of specs.filter((x) => !x.whole)) {
    const up: Item[] = [];
    const gone: Item[] = [];
    for (const it of now.all) {
      if (!spec.match(it)) continue;
      const was = t0.get(itemKeyText(it._table, it));
      const { _table, ...plain } = it as Item & { _table?: TableRole };
      void _table;
      if (!was || canonical(was.item) !== canonical(plain)) { up.push(it); touch(it); }
    }
    for (const [key, was] of t0) if (spec.match(was.item) && !nowByKey.has(key)) { gone.push(was.item); touch(was.item); }
    // A row that points at a parent of its own table (a reply's parent_id) goes after the rows without one.
    // (Same for a replaced session: its `replaced_by` names the session that replaced it, which must exist first.)
    const refs = (x: Item) => Number(Boolean(x['parentId'])) + Number(Boolean(x['replacedBy']));
    up.sort((x, y) => refs(x) - refs(y));
    gone.sort((x, y) => refs(y) - refs(x));
    plan.push({ spec, up, gone });
  }
  const run = async (db: Db) => {
    const colsCache = new Map<string, Map<string, Col>>();
    const cols = async (t: string) => colsCache.get(t) ?? colsCache.set(t, await columnsOf(db, t)).get(t)!;
    for (const { spec, up } of plan) {
      for (const it of up) {
        await upsert(db, spec.pgTable, await cols(spec.pgTable), spec.pk, spec.toRow(it));
        for (const ch of spec.children?.(it) ?? []) {
          const cc = await cols(ch.table);
          await deleteWhere(db, ch.table, cc, ch.match);
          for (const r of ch.rows) {
            const names = Object.keys(r);
            const ps = names.map((k, i) => param(cc.get(k)!, r[k], i + 1));
            await db.query(`INSERT INTO ${ch.table} (${names.join(', ')}) VALUES (${ps.map((p) => p.ph).join(', ')})`, ps.map((p) => p.value));
          }
        }
        upserted[spec.pgTable] = (upserted[spec.pgTable] ?? 0) + 1;
      }
    }
    for (const { spec, gone } of [...plan].reverse()) {
      for (const it of gone) {
        const row = spec.toRow(it);
        await deleteWhere(db, spec.pgTable, await cols(spec.pgTable), Object.fromEntries(spec.pk.map((k) => [k, row[k]])));
        deleted[spec.pgTable] = (deleted[spec.pgTable] ?? 0) + 1;
      }
    }
    for (const { spec, rows } of wholePlan) {
      const cc = await cols(spec.pgTable);
      for (const r of rows) await upsert(db, spec.pgTable, cc, spec.pk, r);
      const keep = new Set(rows.map((r) => spec.pk.map((k) => String(r[k])).join('\u0001')));
      const have = await db.query<Row>(`SELECT ${spec.pk.map((k) => `${k}::text AS ${k}`).join(', ')} FROM ${spec.pgTable}`);
      let gone = 0;
      for (const h of have) {
        if (keep.has(spec.pk.map((k) => String(h[k])).join('\u0001'))) continue;
        await deleteWhere(db, spec.pgTable, cc, Object.fromEntries(spec.pk.map((k) => [k, h[k]])));
        gone++;
      }
      upserted[spec.pgTable] = (upserted[spec.pgTable] ?? 0) + rows.length;
      deleted[spec.pgTable] = (deleted[spec.pgTable] ?? 0) + gone;
    }
    for (const t of SERIAL_TABLES) {
      await db.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT coalesce(max(id), 0) FROM ${t}), 1), (SELECT count(*) > 0 FROM ${t}))`);
    }
    const known = await db.query<{ id: string }>('SELECT id FROM episodes WHERE id = ANY($1::text[])', [[...episodes]]);
    for (const e of known) await rebuildEpisodeHeat(db, e.id);
  };
  if (o.dry) {
    for (const { spec, up, gone } of plan) if (up.length || gone.length) log(`would ${spec.pgTable}: upsert ${up.length}, delete ${gone.length}`);
    for (const { spec, rows } of wholePlan) log(`would rebuild ${spec.pgTable} whole: ${rows.length} rows`);
    return { upserted: Object.fromEntries(plan.map((p) => [p.spec.pgTable, p.up.length])), deleted: Object.fromEntries(plan.map((p) => [p.spec.pgTable, p.gone.length])), episodes: episodes.size };
  }
  await o.pg.transaction(run);
  for (const t of new Set([...Object.keys(upserted), ...Object.keys(deleted)])) log(`copied back ${t}: upserted ${upserted[t] ?? 0}, deleted ${deleted[t] ?? 0}`);
  return { upserted, deleted, episodes: episodes.size };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const c = await connect(args);
  try {
    const r = await copyBack({ pg: c.pg, store: c.store, dry: args['dry'] === true, log: (l) => console.log(l) });
    const n = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0);
    console.log(`copy-back${args['dry'] ? ' (dry run)' : ''}: ${n(r.upserted)} rows upserted, ${n(r.deleted)} deleted, heat rebuilt on ${r.episodes} episodes`);
  } finally {
    await c.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
}
