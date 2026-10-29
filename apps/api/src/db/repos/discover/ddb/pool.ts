// The shared candidate pool of the Discover lists that rank every episode: rebuilt at most once per 5 minutes.
/**
 * M32 T016 (review finding C1). The treasure hunt, the plaza and the video list used to read the whole catalogue (a
 * full G2 index Scan) on EVERY request, and the hunt added one E1 Query per day of its 30-day window. Now:
 *
 * - `sharedPool(store)` holds every episode row and the distinct-listener count per episode over 30 days, built once per
 *   `POOL_TTL` and shared by all callers in this process (module-level; one entry per table set, so tests never collide).
 * - Callers filter per viewer in memory (hidden shows, subscriptions, turned-down items) — those reads stay live.
 * - Concurrent callers share one rebuild. If a rebuild throws, the old pool keeps being served (stale-while-error); the
 *   next call retries. With no old pool the error is raised.
 * - M32 lane FA: the hourly job (the `sweep` step) calls `warmDiscoverPool(store)`: a live build whose result is also stored
 *   as a snapshot in sm-cache (`discover:pool:v1`, chunked by the cache layer when over 350 KB). A cold API instance
 *   reads that snapshot instead of Scanning the catalogue and reading 30 days x 9 partitions — as long as it is younger
 *   than `SNAPSHOT_TTL` (10 minutes). The job's own memory does NOT warm the API Lambda (separate instances); only the
 *   stored snapshot crosses instances. The job runs hourly, so the snapshot covers the first 10 minutes after each run;
 *   later cold starts build live, as before. A snapshot over `SNAPSHOT_MAX_BYTES` (gzipped) is not written, and one that
 *   cannot be read, or is too old, is ignored: the live build is the fallback in every case.
 * - A pool read from the snapshot keeps the snapshot's own `builtAt` as its `at`, so the 5-minute memory TTL is measured from when the
 *   data was built (not from when this instance read it): so data from the snapshot is served for at most the rest of POOL_TTL, then rebuilt live.
 * - Behaviour change, stated: a new episode or listen shows up in the hunt/plaza/video lists within `POOL_TTL`
 *   (the charts already cache 5 minutes).
 */
import { catalogueItems } from '../../../../jobs/charts.ts';
import type { Store } from '../../../ddb/store.ts';
import { DAY_MS, epRowOf, type EpRow } from './common.ts';
import { listensSince } from './listens.ts';
import { gzipSync } from 'node:zlib';
import { readEntry, writeEntry } from '../../library/ddb/cache.ts';

export const POOL_TTL = 5 * 60_000;
/** A stored snapshot older than this is ignored. */
export const SNAPSHOT_TTL = 10 * 60_000;
/** A snapshot whose gzip is larger than this is not stored (reading it would cost many chunk reads): the live build is used. */
export const SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024;
const SNAPSHOT_KEY = 'discover:pool:v1';

type Snapshot = { builtAt: number; rows: EpRow[]; plays: [string, number][] };

export type Pool = { at: number; rows: readonly EpRow[]; plays: ReadonlyMap<string, number> };

type Entry = { pool?: Pool; building?: Promise<Pool> };
const entries = new Map<string, Entry>();

async function buildLive(store: Store): Promise<Pool> {
  const now = store.clock.now();
  const [items, marks] = await Promise.all([catalogueItems(store), listensSince(store, now - 30 * DAY_MS, now)]);
  const who = new Map<string, Set<string>>();
  for (const m of marks) (who.get(m.episodeId) ?? who.set(m.episodeId, new Set()).get(m.episodeId)!).add(m.actorId);
  return { at: now, rows: items.map(epRowOf), plays: new Map([...who].map(([id, s]) => [id, s.size])) };
}

/** The job's snapshot if it is there, readable and younger than SNAPSHOT_TTL; undefined otherwise (never throws). */
async function readSnapshot(store: Store): Promise<Pool | undefined> {
  try {
    const row = await readEntry<Snapshot>(store, SNAPSHOT_KEY);
    const b = row?.body;
    if (!b || !Array.isArray(b.rows) || !Array.isArray(b.plays) || typeof b.builtAt !== 'number') return undefined;
    const now = store.clock.now();
    if (now - b.builtAt >= SNAPSHOT_TTL || b.builtAt > now + 60_000) return undefined;
    return { at: b.builtAt, rows: b.rows, plays: new Map(b.plays) }; // the build time, so POOL_TTL runs from when the data was built
  } catch {
    return undefined;
  }
}

const build = async (store: Store): Promise<Pool> => (await readSnapshot(store)) ?? buildLive(store);

/**
 * The hourly job's warm-up: a live build, kept in this process too, and stored as the snapshot cold instances read.
 * `snapshot`: 'written', 'too-big' (gzip over `maxSnapshotBytes`, nothing stored) or 'failed' (the write threw; the build still stands).
 */
export async function warmDiscoverPool(store: Store, opts: { maxSnapshotBytes?: number } = {}): Promise<{ rows: number; snapshot: 'written' | 'too-big' | 'failed' }> {
  const p = await buildLive(store);
  const e = entries.get(store.tables.main) ?? entries.set(store.tables.main, {}).get(store.tables.main)!;
  e.pool = p;
  const snap: Snapshot = { builtAt: p.at, rows: [...p.rows], plays: [...p.plays] };
  if (gzipSync(Buffer.from(JSON.stringify(snap), 'utf8')).length > (opts.maxSnapshotBytes ?? SNAPSHOT_MAX_BYTES)) return { rows: p.rows.length, snapshot: 'too-big' };
  try {
    await writeEntry(store, SNAPSHOT_KEY, snap, p.at);
    return { rows: p.rows.length, snapshot: 'written' };
  } catch {
    return { rows: p.rows.length, snapshot: 'failed' };
  }
}

/** The pool for this table set: the copy if younger than POOL_TTL, else a rebuild (shared by concurrent callers). */
export async function sharedPool(store: Store): Promise<Pool> {
  const key = store.tables.main;
  const e = entries.get(key) ?? entries.set(key, {}).get(key)!;
  if (entries.size > 64) entries.delete(entries.keys().next().value!);
  if (e.pool && store.clock.now() - e.pool.at < POOL_TTL) return e.pool;
  if (!e.building) {
    e.building = build(store)
      .then((p) => { e.pool = p; return p; })
      .finally(() => { e.building = undefined; });
  }
  try {
    return await e.building;
  } catch (err) {
    if (e.pool) return e.pool; // stale-while-error
    throw err;
  }
}

/** Tests: forget every pool. */
export function resetDiscoverPool(): void {
  entries.clear();
}
