// The cover tint's rows in the `cache` table (`tint:<imageUrl>`): read one, write one.
import type { Db } from '../db.ts';

export type TintCacheRow = { body: { hex: string | null } | string; fetched_at: Date | string };

/** The cached tint row under `key`, as stored (either jsonb shape). */
export async function tintCacheRows(db: Db, key: string): Promise<TintCacheRow[]> {
  return db.query<TintCacheRow>('SELECT body, fetched_at FROM cache WHERE key = $1', [key]);
}

/** Store a tint (`{ hex }`) under `key`, stamped at `atMs`. */
export async function writeTintCache(db: Db, key: string, bodyJson: string, atMs: number): Promise<void> {
  await db.query(
    'INSERT INTO cache (key, body, fetched_at) VALUES ($1, ($2::text)::jsonb, to_timestamp($3::double precision / 1000)) ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, fetched_at = EXCLUDED.fetched_at',
    [key, bodyJson, atMs],
  );
}
