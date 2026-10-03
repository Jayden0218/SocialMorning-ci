/**
 * FR-032: the last successful GET /episodes/:id/social, per episode, plus the
 * "is this stale" flag the UI shows when a refresh fails.
 */
import type { Social } from './api';
import type { SocialCacheStore } from '../storage/types';

export type CachedSocial = { social: Social; etag?: string; fetchedAt: number };

export type SocialCache = {
  get(episodeId: string): CachedSocial | undefined;
  put(episodeId: string, social: Social, etag: string | undefined, now: number): void;
};

export function createSocialCache(store: SocialCacheStore): SocialCache {
  return {
    get(episodeId) {
      const row = store.get(episodeId);
      if (!row) return undefined;
      try {
        return { social: JSON.parse(row.bodyJson) as Social, ...(row.etag ? { etag: row.etag } : {}), fetchedAt: row.fetchedAt };
      } catch {
        return undefined;
      }
    },
    put: (episodeId, social, etag, now) =>
      store.put({ episodeId, ...(etag ? { etag } : {}), fetchedAt: now, bodyJson: JSON.stringify(social) }),
  };
}
