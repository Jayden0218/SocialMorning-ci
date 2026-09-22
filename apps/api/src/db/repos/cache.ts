/**
 * The one caching rule (M5 data-model): a row younger than its TTL is served; else
 * `fetch()` runs and its result is written; a `fetch()` that throws with a stale row
 * present returns the stale row marked `stale: true` (principle IV); with no row at all
 * the error propagates.
 */
import type { Db } from '../db.ts';

export async function cached<T>(db: Db, key: string, ttlMs: number, fetch: () => Promise<T>, now: () => number = Date.now): Promise<{ body: T; stale: boolean }> {
  const rows = await db.query<{ body: T; fetched_at: string }>('SELECT body, fetched_at FROM cache WHERE key = $1', [key]);
  const row = rows[0];
  if (row && now() - new Date(row.fetched_at).getTime() < ttlMs) return { body: row.body, stale: false };
  try {
    const body = await fetch();
    await db.query(
      `INSERT INTO cache (key, body, fetched_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, fetched_at = now()`,
      [key, JSON.stringify(body)],
    );
    return { body, stale: false };
  } catch (e) {
    if (row) return { body: row.body, stale: true };
    throw e;
  }
}

export const TTL = { search: 10 * 60_000, catalog: 60 * 60_000, feed: 60 * 60_000, discover: 60 * 60_000, nextup: 60 * 60_000 } as const;
