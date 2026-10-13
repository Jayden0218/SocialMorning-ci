// Simple database cache: serve fresh rows, fall back to stale rows on failure.
/**
 * The one caching rule (M5 data-model): a row younger than its TTL is served; else
 * `fetch()` runs and its result is written; a `fetch()` that throws with a stale row
 * present returns the stale row marked `stale: true` (principle IV); with no row at all
 * the error propagates.
 */
import type { Db } from '../db.ts';
import { viaStore } from '../backend.ts';

export const TTL = { search: 10 * 60_000, catalog: 60 * 60_000, feed: 60 * 60_000, discover: 60 * 60_000, nextup: 60 * 60_000 } as const;

// Each function runs its DynamoDB body (`library/ddb/cache.ts`) on the Store the Db carries (db/backend.ts).
const cachedBound = viaStore<typeof import('./library/ddb/cache.ts').cached>('lb/cache', 'cached');
/** `viaStore` erases the generic, so `cached` is re-exported with it. */
export const cached = cachedBound as unknown as <T>(db: Db, key: string, ttlMs: number, fetch: () => Promise<T>, now?: () => number) => Promise<{ body: T; stale: boolean }>;
export const touchCacheMarker = viaStore<typeof import('./library/ddb/cache.ts').touchCacheMarker>('lb/cache', 'touchCacheMarker');
export const deleteCacheKey = viaStore<typeof import('./library/ddb/cache.ts').deleteCacheKey>('lb/cache', 'deleteCacheKey');
export const invalidateCachePrefix = viaStore<typeof import('./library/ddb/cache.ts').invalidateCachePrefix>('lb/cache', 'invalidateCachePrefix');
