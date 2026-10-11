// The dashboard's hourly safety counters: moved in the same transaction as the report, action or block they count.
/**
 * M26 lane SF (SF-T06; data-model.md §7 — kept exact like a kind-A counter, not lagging). `R#dash#<metric>` /
 * `<yyyy-mm-ddThh>` in sm-events holds `n`, the number of rows the M18 SQL would count for that UTC hour:
 * - reports  — reports created (a report is never deleted inside the 90-day window: the purge takes closed
 *              reports > 90 days old);
 * - actions  — moderation actions taken (never deleted);
 * - blocks   — blocks that EXIST (an unblock or an account deletion takes its hour back off, as the SQL
 *              `count(*) FROM blocks WHERE created_at >= …` no longer sees the row).
 * Hours sum to UTC+8 days exactly (the offset is whole hours). The nightly check (metrics.ts `checkDashboard`)
 * recounts every hour of a day from the items themselves and repairs a counter that drifted (guard G-M26-SF4).
 */
import * as K from '../../../ddb/keys.ts';
import type { Tx } from '../../../ddb/tx.ts';

export const DASH_METRICS = ['reports', 'actions', 'blocks'] as const;
export type DashMetric = (typeof DASH_METRICS)[number];

/** The hourly counter item of `metric` for the instant `at`. */
export const dashKey = (metric: DashMetric, at: string) => K.ev.rollup('dash', metric, at);

/** Adds the counter change to `t` (one per metric and hour per transaction). */
export function dashAdd(t: Tx, metric: DashMetric, at: string, n = 1): Tx {
  return t.update('events', dashKey(metric, at), {
    update: 'SET #t = :t, #m = :m ADD #n :n',
    names: { '#t': 't', '#m': 'metric', '#n': 'n' },
    values: { ':t': 'rollup', ':m': metric, ':n': n },
    label: `dash:${metric}`,
  });
}
