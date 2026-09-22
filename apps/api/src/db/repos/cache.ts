/**
 * The one caching rule (M5 data-model): a row younger than its TTL is served; else
 * `fetch()` runs and its result is written; a `fetch()` that throws with a stale row
 * present returns the stale row marked `stale: true` (principle IV); with no row at all
 * the error propagates.
 */
import type { Db } from '../db.ts';

export async function cached<T>(db: Db, key: string, ttlMs: number, fetch: () => Promise<T>, now: () => number = Date.now): Promise<{ body: T; stale: boolean }> {
  const rows = await db.query<{ body: T | string; fetched_at: string }>('SELECT body, fetched_at FROM cache WHERE key = $1', [key]);
  // Seen live 2026-09-22: the `postgres` driver hands a jsonb column back as an object, but a
  // string parameter cast `::jsonb` had been stored as a JSON *string* (double-encoded) — pglite
  // did not, so the tests were green. Insert through text explicitly; read either shape.
  const raw = rows[0];
  const row = raw ? { fetched_at: raw.fetched_at, body: (typeof raw.body === 'string' ? JSON.parse(raw.body) : raw.body) as T } : undefined;
  if (row && now() - new Date(row.fetched_at).getTime() < ttlMs) return { body: row.body, stale: false };
  try {
    const body = await fetch();
    // fetched_at comes from the same clock the freshness check reads, so tests can move it.
    await db.query(
      `INSERT INTO cache (key, body, fetched_at) VALUES ($1, ($2::text)::jsonb, to_timestamp($3::double precision / 1000)) ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, fetched_at = EXCLUDED.fetched_at`,
      [key, JSON.stringify(body), now()],
    );
    return { body, stale: false };
  } catch (e) {
    if (row) return { body: row.body, stale: true };
    throw e;
  }
}

export const TTL = { search: 10 * 60_000, catalog: 60 * 60_000, feed: 60 * 60_000, discover: 60 * 60_000, nextup: 60 * 60_000 } as const;
