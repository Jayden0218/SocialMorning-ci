// Our own error log: phone errors counted by scope, message, version and platform; kept 30 days.
/**
 * M23 US8 (FR-013; owner decision 2026-10-07: no outside service). One row per
 * (scope, message, app_version, platform) — the same error from many phones is one row whose
 * `count` grows and whose `last_seen` moves. Nothing personal beyond the listener id (the last
 * one who sent it, or NULL when signed out). Rows unseen for 30 days are deleted by the sweep.
 */
import type { Db } from '../../db.ts';
import { sweepRateCounters } from '../../../auth/rate.ts';
import { dual } from '../../backend.ts';

export const ERROR_DAYS = 30;
export const SCOPE_MAX = 80;
export const MESSAGE_MAX = 500;
export const STACK_MAX = 2048;

export type ErrorIn = { scope: string; message: string; stack?: string; appVersion?: string; platform?: string };
export type ErrorRow = { scope: string; message: string; stack: string | null; app_version: string; platform: string; count: number; first_seen: string | Date; last_seen: string | Date };

const clip = (s: string, n: number) => [...s].slice(0, n).join('');

/** Adds a batch; a repeat of a known error only counts up. Returns how many rows were touched. */
export const recordErrors = dual('ac/index', 'recordErrors', async (db: Db, listenerId: string | null, items: readonly ErrorIn[]): Promise<number> => {
  let n = 0;
  for (const e of items) {
    const scope = clip(e.scope.trim(), SCOPE_MAX);
    const message = clip(e.message.trim(), MESSAGE_MAX);
    if (!scope || !message) continue;
    await db.query(
      `INSERT INTO error_reports (listener_id, scope, message, stack, app_version, platform)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (scope, message, app_version, platform) DO UPDATE SET
         count = error_reports.count + 1, last_seen = now(),
         listener_id = COALESCE(EXCLUDED.listener_id, error_reports.listener_id),
         stack = COALESCE(EXCLUDED.stack, error_reports.stack)`,
      [listenerId, scope, message, e.stack ? clip(e.stack, STACK_MAX) : null, clip(e.appVersion ?? '', 40), clip(e.platform ?? '', 20)],
    );
    n++;
  }
  return n;
});

/** Newest first, for /mod/errors. */
export const recentErrors = dual('ac/index', 'recentErrors', async (db: Db, limit = 200): Promise<ErrorRow[]> => {
  return db.query<ErrorRow>(
    'SELECT scope, message, stack, app_version, platform, count, first_seen, last_seen FROM error_reports ORDER BY last_seen DESC LIMIT $1',
    [limit],
  );
});

/**
 * The hourly sweep (internal.ts `sweep` step calls it): error rows unseen for 30 days go, and so
 * do rate-limit windows older than two days (auth/rate.ts). Returns the error rows deleted.
 */
export const sweepErrorReports = dual('ac/index', 'sweepErrorReports', async (db: Db): Promise<number> => {
  const rows = await db.query<{ id: string }>(
    `DELETE FROM error_reports WHERE last_seen < now() - make_interval(days => $1::int) RETURNING id`, [ERROR_DAYS]);
  await sweepRateCounters(db);
  return rows.length;
});

/**
 * M25 S11: one unhandled server error, kept like a phone's (scope 'server', platform 'server').
 * Returns true when this signature is new — the first row of its kind — so the caller can alert.
 */
export const recordServerError = dual('ac/index', 'recordServerError', async (db: Db, e: { message: string; stack?: string }): Promise<boolean> => {
  const message = clip(e.message.trim() || 'unknown error', MESSAGE_MAX);
  const [row] = await db.query<{ count: number }>(
    `INSERT INTO error_reports (listener_id, scope, message, stack, app_version, platform)
     VALUES (NULL, 'server', $1, $2, '', 'server')
     ON CONFLICT (scope, message, app_version, platform) DO UPDATE SET
       count = error_reports.count + 1, last_seen = now(), stack = COALESCE(EXCLUDED.stack, error_reports.stack)
     RETURNING count`,
    [message, e.stack ? clip(e.stack, STACK_MAX) : null],
  );
  return Number(row?.count ?? 0) === 1;
});
