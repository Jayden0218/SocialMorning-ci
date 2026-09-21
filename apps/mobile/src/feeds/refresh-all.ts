/**
 * Refreshing every subscription when the Library comes into focus.
 *
 * Two rules, both Principle IV:
 *  - one feed failing must not stop the others. A publisher who lets their
 *    certificate expire cannot be allowed to cost you the rest of your shows.
 *  - a failure keeps the cached copy and is REPORTED as stale, rather than
 *    being swallowed or blanking the row.
 *
 * Sequential on purpose: a hundred parallel requests off a phone on mobile
 * data is worse for the listener than waiting, and nothing here blocks the UI.
 */
import { refreshShow } from './fetch';
import type { Stores } from '../storage/types';

export type RefreshAllResult = {
  refreshed: string[];
  /** Feeds now showing a cached copy because the refresh did not succeed. */
  stale: string[];
  /** Feeds with nothing cached AND a failed refresh — the only real errors. */
  failed: string[];
};

export const PER_FEED_TIMEOUT_MS = 10_000;

export async function refreshAll(
  stores: Stores,
  now: number,
  timeoutMs: number = PER_FEED_TIMEOUT_MS,
): Promise<RefreshAllResult> {
  const result: RefreshAllResult = { refreshed: [], stale: [], failed: [] };

  for (const { feedUrl } of stores.subscriptions.list()) {
    const controller = new AbortController();
    // A feed that never answers must not hold the whole library open.
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const refreshed = await refreshShow(feedUrl, stores.feeds, now, controller.signal);
      if (refreshed.stale) result.stale.push(feedUrl);
      else result.refreshed.push(feedUrl);
    } catch {
      // refreshShow only throws when there is nothing cached to fall back on.
      result.failed.push(feedUrl);
    } finally {
      clearTimeout(timer);
    }
  }

  return result;
}
