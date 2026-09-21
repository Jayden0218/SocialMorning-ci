/**
 * The Following feed on the phone (M4 FR-008/FR-009): fetched on open and on pull with
 * the ETag, the last copy kept in `feed_cache` and shown as stale when the server cannot
 * be reached (M3's pattern), an unread count against the last time the screen opened.
 */
import { orderFeed, unreadCount } from '@socialmorning/social-core';
import { ApiError, type ApiClient, type FeedItem } from '../social/api';
import type { FeedCacheStore, SettingsStore } from '../storage/types';

export const FEED_KEY = 'following';
export const FEED_LAST_OPENED_KEY = 'feed.lastOpenedAt';

export type FeedDeps = { api: ApiClient; cache: FeedCacheStore; settings: SettingsStore; now: () => number };
export type FeedView = { items: FeedItem[]; stale: boolean; fetchedAt?: number; next?: string };

export function createFeed(deps: FeedDeps) {
  const read = (): { items: FeedItem[]; next?: string; etag?: string; fetchedAt: number } | undefined => {
    const row = deps.cache.get(FEED_KEY);
    if (!row) return undefined;
    try {
      const body = JSON.parse(row.body) as { items: FeedItem[]; next?: string };
      return { items: body.items, ...(body.next ? { next: body.next } : {}), ...(row.etag ? { etag: row.etag } : {}), fetchedAt: row.fetchedAt };
    } catch { return undefined; }
  };
  return {
    /** What to show right now, before any fetch. */
    cached(): FeedView | undefined {
      const c = read();
      return c ? { items: sortItems(c.items), stale: true, fetchedAt: c.fetchedAt, ...(c.next ? { next: c.next } : {}) } : undefined;
    },
    /** Fetch the first page; `stale: true` means the server could not be reached and the copy is old. */
    async refresh(): Promise<FeedView> {
      const c = read();
      try {
        const r = await deps.api.feed(undefined, c?.etag);
        if (r.status === 304 && c) return { items: sortItems(c.items), stale: false, fetchedAt: c.fetchedAt, ...(c.next ? { next: c.next } : {}) };
        if (r.status === 304) return { items: [], stale: false };
        const body = { items: r.body.items, ...(r.body.next ? { next: r.body.next } : {}) };
        deps.cache.set({ key: FEED_KEY, ...(r.etag ? { etag: r.etag } : {}), fetchedAt: deps.now(), body: JSON.stringify(body) });
        return { items: sortItems(body.items), stale: false, fetchedAt: deps.now(), ...(body.next ? { next: body.next } : {}) };
      } catch (e) {
        if (e instanceof ApiError && e.code === 'unauthenticated') return { items: [], stale: false };
        return c ? { items: sortItems(c.items), stale: true, fetchedAt: c.fetchedAt, ...(c.next ? { next: c.next } : {}) } : { items: [], stale: true };
      }
    },
    /** The next page, appended by the caller; never cached. */
    async more(next: string): Promise<{ items: FeedItem[]; next?: string }> {
      const r = await deps.api.feed(next);
      if (r.status === 304) return { items: [] };
      return { items: r.body.items, ...(r.body.next ? { next: r.body.next } : {}) };
    },
    unread(items: readonly FeedItem[]): number {
      const raw = deps.settings.get(FEED_LAST_OPENED_KEY);
      return unreadCount(items.map((i) => ({ createdAt: Date.parse(i.createdAt) })), raw === undefined ? undefined : Number(raw));
    },
    markOpened(): void { deps.settings.set(FEED_LAST_OPENED_KEY, String(deps.now())); },
  };
}

function sortItems(items: readonly FeedItem[]): FeedItem[] {
  const keyed = items.map((i) => ({ item: i, id: i.id, createdAt: Date.parse(i.createdAt) }));
  return orderFeed(keyed).map((k) => k.item);
}
