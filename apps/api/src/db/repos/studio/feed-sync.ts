// A claimed feed's last fetch — when, whether it worked, the error — and the "Sync now" limit.
/**
 * M24 US10 (specs/025-m24-gaps-and-look). The hourly `feeds` step writes one row per feed it
 * fetched; "Sync now" in the Studio writes the same row and `manual_at`, at most once per
 * 10 minutes per feed. Only feeds someone subscribes to are fetched hourly, so a claimed feed
 * nobody follows yet shows "never" until its first Sync now.
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export const MANUAL_EVERY_MS = 10 * 60_000;

export type SyncStatus = { fetchedAt: string | null; ok: boolean | null; error: string | null; nextManualAt: string | null };

async function recordSyncPg(db: Db, feedUrl: string, ok: boolean, error: string | null, manual = false): Promise<void> {
  await db.query(
    `INSERT INTO feed_sync (feed_url, fetched_at, ok, error, manual_at) VALUES ($1, now(), $2, $3, CASE WHEN $4::boolean THEN now() END)
     ON CONFLICT (feed_url) DO UPDATE SET fetched_at = now(), ok = EXCLUDED.ok, error = EXCLUDED.error,
       manual_at = CASE WHEN $4::boolean THEN now() ELSE feed_sync.manual_at END`,
    [feedUrl, ok, error === null ? null : error.slice(0, 500), manual]);
}

async function syncStatusPg(db: Db, feedUrl: string): Promise<SyncStatus> {
  const [r] = await db.query<{ fetched_at: Date | string; ok: boolean; error: string | null; manual_at: Date | string | null }>(
    'SELECT fetched_at, ok, error, manual_at FROM feed_sync WHERE feed_url = $1', [feedUrl]);
  if (!r) return { fetchedAt: null, ok: null, error: null, nextManualAt: null };
  const next = r.manual_at ? new Date(r.manual_at).getTime() + MANUAL_EVERY_MS : 0;
  return {
    fetchedAt: new Date(r.fetched_at).toISOString(), ok: r.ok, error: r.error,
    nextManualAt: next > Date.now() ? new Date(next).toISOString() : null,
  };
}

/**
 * Claims the manual slot: true when no Sync now ran in the last 10 minutes (and marks it now).
 * One statement, so two clicks at the same moment cannot both pass.
 */
async function claimManualPg(db: Db, feedUrl: string): Promise<boolean> {
  const rows = await db.query(
    `INSERT INTO feed_sync (feed_url, fetched_at, ok, error, manual_at) VALUES ($1, now(), false, 'Sync started', now())
     ON CONFLICT (feed_url) DO UPDATE SET manual_at = now()
       WHERE feed_sync.manual_at IS NULL OR feed_sync.manual_at <= now() - ($2 || ' milliseconds')::interval
     RETURNING 1`,
    [feedUrl, String(MANUAL_EVERY_MS)]);
  return rows.length > 0;
}

/** Drop the cached copy of a feed so the next fetch is a real one. */
async function dropFeedCachePg(db: Db, feedUrl: string): Promise<void> {
  await db.query('DELETE FROM cache WHERE key = $1', [`feed:${feedUrl}`]);
}

// M26 lane ST: each runs on Postgres, or on DynamoDB (ddb/page.ts) when the Db carries a Store (db/backend.ts).
export const recordSync = dual('st/page', 'recordSync', recordSyncPg);
export const syncStatus = dual('st/page', 'syncStatus', syncStatusPg);
export const claimManual = dual('st/page', 'claimManual', claimManualPg);
export const dropFeedCache = dual('st/page', 'dropFeedCache', dropFeedCachePg);
