// The cover tint's rows in the `cache` table (`tint:<imageUrl>`): read one, write one.
import { viaStore } from '../backend.ts';

export type TintCacheRow = { body: { hex: string | null } | string; fetched_at: Date | string };

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const tintCacheRows = viaStore<typeof import('./library/ddb/tint-cache.ts').tintCacheRows>('lb/tint-cache', 'tintCacheRows');
export const writeTintCache = viaStore<typeof import('./library/ddb/tint-cache.ts').writeTintCache>('lb/tint-cache', 'writeTintCache');
