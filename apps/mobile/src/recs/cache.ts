/**
 * M8 US2 — For You's last copy (FR-020).
 *
 * Exactly M5's Discover cache with a different key and one extra rule: the list is
 * **per listener**, so signing out must not leave the previous listener's
 * recommendations on the screen. `forget()` is called from sign-out.
 */
import { ApiError, type ApiClient, type ForYou } from '../social/api';
import type { FeedCacheStore } from '../storage/types';

export const FOR_YOU_KEY = 'foryou';
export type ForYouView = { body: ForYou; stale: boolean; fetchedAt?: number };

export function createForYou(deps: { api: ApiClient; cache: FeedCacheStore; now: () => number }) {
  const read = () => {
    const row = deps.cache.get(FOR_YOU_KEY);
    if (!row || row.body === '') return undefined;
    try { return { body: JSON.parse(row.body) as ForYou, etag: row.etag, fetchedAt: row.fetchedAt }; } catch { return undefined; }
  };
  return {
    cached(): ForYouView | undefined {
      const c = read();
      return c ? { body: c.body, stale: true, fetchedAt: c.fetchedAt } : undefined;
    },
    /** Sign-out: the next listener must not see this one's list. */
    forget(): void {
      deps.cache.set({ key: FOR_YOU_KEY, fetchedAt: 0, body: '' });
    },
    async refresh(): Promise<ForYouView | undefined> {
      const c = read();
      try {
        const r = await deps.api.forYou(c?.etag);
        if (r.status === 304) return c ? { body: c.body, stale: false, fetchedAt: c.fetchedAt } : undefined;
        deps.cache.set({ key: FOR_YOU_KEY, ...(r.etag ? { etag: r.etag } : {}), fetchedAt: deps.now(), body: JSON.stringify(r.body) });
        return { body: r.body, stale: r.body.stale, fetchedAt: deps.now() };
      } catch (e) {
        if (c) return { body: c.body, stale: true, fetchedAt: c.fetchedAt };
        // Signed out, or no connection and nothing cached: the section simply is not there.
        if (e instanceof ApiError && (e.code === 'network' || e.code === 'unauthenticated')) return undefined;
        throw e;
      }
    },
  };
}
