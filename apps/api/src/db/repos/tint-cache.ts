// The cover tint's rows in the `cache` table (`tint:<imageUrl>`): read one, write one.
import type { Db } from '../db.ts';
import { dual } from '../backend.ts';

export type TintCacheRow = { body: { hex: string | null } | string; fetched_at: Date | string };

/** The cached tint row under `key`, as stored (either jsonb shape). */
async function tintCacheRowsPg(db: Db, key: string): Promise<TintCacheRow[]> {
  return db.query<TintCacheRow>('SELECT body, fetched_at FROM cache WHERE key = $1', [key]);
}

/** Store a tint (`{ hex }`) under `key`, stamped at `atMs`. */
async function writeTintCachePg(db: Db, key: string, bodyJson: string, atMs: number): Promise<void> {
  await db.query(
    'INSERT INTO cache (key, body, fetched_at) VALUES ($1, ($2::text)::jsonb, to_timestamp($3::double precision / 1000)) ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, fetched_at = EXCLUDED.fetched_at',
    [key, bodyJson, atMs],
  );
}

// M26 lane LB: each function runs on Postgres, or on DynamoDB (`ddb/` bodies) when the Db carries a Store (db/backend.ts).
export const tintCacheRows = dual('lb/tint-cache', 'tintCacheRows', tintCacheRowsPg);
export const writeTintCache = dual('lb/tint-cache', 'writeTintCache', writeTintCachePg);
