// A claimed feed's last fetch — when, whether it worked, the error — and the "Sync now" limit.
/**
 * M24 US10 (specs/025-m24-gaps-and-look). The hourly `feeds` step writes one row per feed it
 * fetched; "Sync now" in the Studio writes the same row and `manual_at`, at most once per
 * 10 minutes per feed. Only feeds someone subscribes to are fetched hourly, so a claimed feed
 * nobody follows yet shows "never" until its first Sync now.
 */
import { viaStore } from '../../backend.ts';

export const MANUAL_EVERY_MS = 10 * 60_000;

export type SyncStatus = { fetchedAt: string | null; ok: boolean | null; error: string | null; nextManualAt: string | null };

// DynamoDB bodies: ddb/page.ts (db/backend.ts).
export const recordSync = viaStore<typeof import('./ddb/page.ts').recordSync>('st/page', 'recordSync');
export const syncStatus = viaStore<typeof import('./ddb/page.ts').syncStatus>('st/page', 'syncStatus');
export const claimManual = viaStore<typeof import('./ddb/page.ts').claimManual>('st/page', 'claimManual');
export const dropFeedCache = viaStore<typeof import('./ddb/page.ts').dropFeedCache>('st/page', 'dropFeedCache');
