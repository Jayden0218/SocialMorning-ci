/**
 * Discover's last copy (M5 FR-003): fetched on open and on pull with the ETag, kept in
 * M4's `feed_cache` table under key `discover`, shown as stale when the server cannot be
 * reached — the same pattern as the Following feed.
 */
import { ApiError, type ApiClient, type Discover } from '../social/api';
import type { FeedCacheStore } from '../storage/types';

export const DISCOVER_KEY = 'discover';
export type DiscoverView = { body: Discover; stale: boolean; fetchedAt?: number };

export function createDiscover(deps: { api: ApiClient; cache: FeedCacheStore; now: () => number }) {
  const read = () => {
    const row = deps.cache.get(DISCOVER_KEY);
    if (!row) return undefined;
    try { return { body: JSON.parse(row.body) as Discover, etag: row.etag, fetchedAt: row.fetchedAt }; } catch { return undefined; }
  };
  return {
    cached(): DiscoverView | undefined {
      const c = read();
      return c ? { body: c.body, stale: true, fetchedAt: c.fetchedAt } : undefined;
    },
    async refresh(): Promise<DiscoverView | undefined> {
      const c = read();
      try {
        const r = await deps.api.discover(c?.etag);
        if (r.status === 304) return c ? { body: c.body, stale: false, fetchedAt: c.fetchedAt } : undefined;
        deps.cache.set({ key: DISCOVER_KEY, ...(r.etag ? { etag: r.etag } : {}), fetchedAt: deps.now(), body: JSON.stringify(r.body) });
        return { body: r.body, stale: r.body.stale, fetchedAt: deps.now() };
      } catch (e) {
        if (c) return { body: c.body, stale: true, fetchedAt: c.fetchedAt };
        if (e instanceof ApiError && e.code === 'network') return undefined;
        throw e;
      }
    },
  };
}
