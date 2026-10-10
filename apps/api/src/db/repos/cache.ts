// Simple database cache: serve fresh rows, fall back to stale rows on failure.
/**
 * The one caching rule (M5 data-model): a row younger than its TTL is served; else
 * `fetch()` runs and its result is written; a `fetch()` that throws with a stale row
 * present returns the stale row marked `stale: true` (principle IV); with no row at all
 * the error propagates.
 */
import type { Db } from '../db.ts';
import { dual } from '../backend.ts';

async function cachedPg<T>(db: Db, key: string, ttlMs: number, fetch: () => Promise<T>, now: () => number = Date.now): Promise<{ body: T; stale: boolean }> {
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

/** A marker row with an empty body; writing it again only refreshes `fetched_at`. */
async function touchCacheMarkerPg(db: Db, key: string): Promise<void> {
  await db.query("INSERT INTO cache (key, body, fetched_at) VALUES ($1, '{}'::jsonb, now()) ON CONFLICT (key) DO UPDATE SET fetched_at = now()", [key]);
}

async function deleteCacheKeyPg(db: Db, key: string): Promise<void> {
  await db.query('DELETE FROM cache WHERE key = $1', [key]);
}

/**
 * M26 lane LB: drops every row under a key prefix (Discover's and For You's caches). On DynamoDB a prefix
 * cannot be listed without a Scan, so there it moves the prefix's generation on (ddb/cache.ts); the prefix
 * must be one of its GENERATION_PREFIXES.
 */
async function invalidateCachePrefixPg(db: Db, prefix: string): Promise<void> {
  await db.query('DELETE FROM cache WHERE key LIKE $1', [`${prefix.replace(/[\\%_]/g, '\\$&')}%`]);
}

export const TTL = { search: 10 * 60_000, catalog: 60 * 60_000, feed: 60 * 60_000, discover: 60 * 60_000, nextup: 60 * 60_000 } as const;

// M26 lane LB: each function runs on Postgres, or on DynamoDB (`ddb/` bodies) when the Db carries a Store (db/backend.ts).
export const cached = dual('lb/cache', 'cached', cachedPg);
export const touchCacheMarker = dual('lb/cache', 'touchCacheMarker', touchCacheMarkerPg);
export const deleteCacheKey = dual('lb/cache', 'deleteCacheKey', deleteCacheKeyPg);
export const invalidateCachePrefix = dual('lb/cache', 'invalidateCachePrefix', invalidateCachePrefixPg);
