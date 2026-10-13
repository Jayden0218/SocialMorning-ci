// Our own error log: phone errors counted by scope, message, version and platform; kept 30 days.
/**
 * M23 US8 (FR-013; owner decision 2026-10-07: no outside service). One row per
 * (scope, message, app_version, platform) — the same error from many phones is one row whose
 * `count` grows and whose `last_seen` moves. Nothing personal beyond the listener id (the last
 * one who sent it, or NULL when signed out). Rows unseen for 30 days are deleted by the sweep.
 */
import { viaStore } from '../../backend.ts';

export const ERROR_DAYS = 30;
export const SCOPE_MAX = 80;
export const MESSAGE_MAX = 500;
export const STACK_MAX = 2048;

export type ErrorIn = { scope: string; message: string; stack?: string; appVersion?: string; platform?: string };
export type ErrorRow = { scope: string; message: string; stack: string | null; app_version: string; platform: string; count: number; first_seen: string | Date; last_seen: string | Date };

/** Adds a batch; a repeat of a known error only counts up. Returns how many rows were touched. */
export const recordErrors = viaStore<typeof import('./ddb/index.ts').recordErrors>('ac/index', 'recordErrors');

/** Newest first, for /mod/errors. */
export const recentErrors = viaStore<typeof import('./ddb/index.ts').recentErrors>('ac/index', 'recentErrors');

/**
 * The hourly sweep (internal.ts `sweep` step calls it): error rows unseen for 30 days go, and so
 * do rate-limit windows older than two days (auth/rate.ts). Returns the error rows deleted.
 */
export const sweepErrorReports = viaStore<typeof import('./ddb/index.ts').sweepErrorReports>('ac/index', 'sweepErrorReports');

/**
 * M25 S11: one unhandled server error, kept like a phone's (scope 'server', platform 'server').
 * Returns true when this signature is new — the first row of its kind — so the caller can alert.
 */
export const recordServerError = viaStore<typeof import('./ddb/index.ts').recordServerError>('ac/index', 'recordServerError');
