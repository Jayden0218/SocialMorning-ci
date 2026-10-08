// Start-up: use the last saved app settings before the first screen draws, then fetch the server's once.
/**
 * M25 A7. Called once from app/_layout.tsx. The cached copy (or the built-in defaults) is applied
 * while the root layout first renders, so the first Discover already has the admin's tiles and
 * categories; the server's answer follows and is applied when it arrives. Offline or on any error
 * the phone keeps what it has (src/config/load.ts).
 */
import { useEffect, useState } from 'react';
import type { FeedCacheStore } from '@/storage/types';
import { apiBaseUrl } from '@/social/base-url';
import { secureToken } from '@/social/token';
import { createConfigApi } from './api';
import { createConfigLoader } from './load';
import { applyConfig } from './store';

export function useStartConfig(cache: FeedCacheStore): void {
  const [loader] = useState(() => {
    const l = createConfigLoader({ api: createConfigApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), cache, now: () => Date.now() });
    applyConfig(l.fromCache());
    return l;
  });
  useEffect(() => {
    void loader.refresh().then(applyConfig);
  }, [loader]);
}
