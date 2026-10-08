// Loads the app settings at start-up: the last saved copy at once, then the server's, falling back to the built-in defaults.
/**
 * M25 A7 (guard G-AC1, "config fallback"). Order at start-up:
 *  1. `fromCache` — the last copy the server sent (kept in `feed_cache` under `app-config`),
 *     checked again by `readConfig`; nothing kept, or unreadable → the built-in defaults.
 *  2. `refresh` — `GET /v1/config` with the ETag. 304 → keep what we have; 200 → check, keep, use.
 *     The server down, a timeout or a broken answer → keep what we have (the cached copy, or the
 *     defaults). It never throws: start-up must not wait on, or fail because of, this call.
 * The built-in defaults are today's app, so a phone that never reaches the server is unchanged.
 */
import { CONFIG_DEFAULTS, readConfig, type AppConfig } from '@socialmorning/social-core';
import type { FeedCacheStore } from '@/storage/types';
import type { ConfigApi } from './api';

export const CONFIG_CACHE_KEY = 'app-config';

export function createConfigLoader(deps: { api: Pick<ConfigApi, 'config'>; cache: FeedCacheStore; now: () => number }) {
  const cached = (): { config: AppConfig; etag?: string } | undefined => {
    const row = deps.cache.get(CONFIG_CACHE_KEY);
    if (!row) return undefined;
    try {
      return { config: readConfig((JSON.parse(row.body) as { config?: unknown }).config), ...(row.etag ? { etag: row.etag } : {}) };
    } catch {
      return undefined;
    }
  };
  return {
    fromCache(): AppConfig {
      return cached()?.config ?? CONFIG_DEFAULTS;
    },
    async refresh(): Promise<AppConfig> {
      const c = cached();
      try {
        const r = await deps.api.config(c?.etag);
        if (r.status === 304) return c?.config ?? CONFIG_DEFAULTS;
        const body = (r.body ?? {}) as { config?: unknown };
        const config = readConfig(body.config);
        deps.cache.set({ key: CONFIG_CACHE_KEY, ...(r.etag ? { etag: r.etag } : {}), fetchedAt: deps.now(), body: JSON.stringify({ config }) });
        return config;
      } catch {
        return c?.config ?? CONFIG_DEFAULTS;
      }
    },
  };
}
