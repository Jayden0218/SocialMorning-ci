// One shared feed refresh for every screen: single flight, one throttle, bounded concurrency.
/**
 * Review finding C3. Updates, Subscriptions and sign-in each called `refreshAll` on their own,
 * with their own throttle, so several refreshes could overlap and fetch every feed again.
 * Now they all call `refreshFeeds`:
 *  - single flight: a trigger while a refresh runs gets the SAME promise;
 *  - one throttle for the whole app: no new run within `REFRESH_THROTTLE_MS` of the last
 *    start unless `force` is set (pull to refresh, a new sign-in);
 *  - the pool inside `refreshAll` runs 3 feeds at once and yields between feeds.
 */
import { PER_FEED_TIMEOUT_MS, refreshAll, type RefreshAllResult } from './refresh-all';
import type { Stores } from '@/storage/types';

export const REFRESH_THROTTLE_MS = 5 * 60_000;

type Opts = {
  /** Ignore the throttle (a single flight still applies). */
  force?: boolean;
  hiddenOf?: (feedUrl: string) => Promise<string[]>;
  timeoutMs?: number;
  /** Clock, for tests. */
  nowMs?: number;
};

let inFlight: Promise<RefreshAllResult> | undefined;
let lastStart = 0;
let lastResult: RefreshAllResult = { refreshed: [], stale: [], failed: [] };

export function refreshFeeds(stores: Stores, opts: Opts = {}): Promise<RefreshAllResult> {
  if (inFlight) return inFlight;
  const now = opts.nowMs ?? Date.now();
  if (!opts.force && lastStart !== 0 && now - lastStart < REFRESH_THROTTLE_MS) {
    return Promise.resolve(lastResult);
  }
  lastStart = now;
  const run = refreshAll(stores, now, opts.timeoutMs ?? PER_FEED_TIMEOUT_MS, opts.hiddenOf)
    .then((r) => { lastResult = r; return r; })
    .finally(() => { inFlight = undefined; });
  inFlight = run;
  return run;
}

/** For tests. */
export function resetRefreshService(): void {
  inFlight = undefined;
  lastStart = 0;
  lastResult = { refreshed: [], stale: [], failed: [] };
}
