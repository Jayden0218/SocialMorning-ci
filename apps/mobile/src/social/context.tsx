/**
 * What the social screens need: the API client, the auth API, and a live
 * "who am I" that re-renders on sign-in/out. Mounted inside <AppProviders>.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ApiError, createApi, type ApiClient, type Social } from './api';
import { createAuth, type AuthApi } from './auth-store';
import { createComposer, type Composer } from './composer';
import { createDrafts } from './drafts';
import { createSocialCache, type CachedSocial, type SocialCache } from './cache';
import { registrationFor } from './registration';
import { createReactToggle } from './react';
import { secureToken } from './token';
import { usePositionSync, useStores } from '../ui/providers';
import { apiBaseUrl } from './base-url';
import type { AuthRow } from '../storage/types';

export type SocialContextValue = {
  api: ApiClient;
  auth: AuthApi;
  listener: AuthRow | undefined;
  /** Re-read the auth row (after sign-in/out on another screen). */
  refreshListener: () => void;
  composer: Composer;
  reactToggle: ReturnType<typeof createReactToggle>;
  cache: SocialCache;
  /** Read the cached social view for an episode; re-renders when `bump` is called for it. */
  useEpisodeSocial: (episodeId: string | undefined) => { cached: CachedSocial | undefined; stale: boolean };
  /** Tell subscribers the cache changed for this episode (after a post/poll). */
  bump: (episodeId: string, stale?: boolean) => void;
  /** Fetch once and cache; `stale: true` means the server could not be reached. */
  refresh: (episodeId: string) => Promise<{ social: Social | undefined; stale: boolean }>;
};

const SocialContext = createContext<SocialContextValue | undefined>(undefined);

export function useSocial(): SocialContextValue {
  const v = useContext(SocialContext);
  if (v === undefined) throw new Error('useSocial must be used inside <SocialProvider>');
  return v;
}

export function SocialProvider(props: { children?: ReactNode }): ReactNode {
  const stores = useStores();
  const sync = usePositionSync();
  const [listener, setListener] = useState<AuthRow | undefined>(() => stores.auth.get());

  const api = useMemo(() => createApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
  const auth = useMemo(() => createAuth({ api, stores, token: secureToken, now: () => Date.now(), onSignedIn: () => sync.reconcile() }), [api, stores, sync]);
  const refreshListener = useCallback(() => setListener(stores.auth.get()), [stores]);
  const cache = useMemo(() => createSocialCache(stores.socialCache), [stores]);
  const drafts = useMemo(() => createDrafts(stores.drafts, () => Date.now()), [stores]);
  const composer = useMemo(() => createComposer({
    api, drafts, cache,
    isSignedIn: () => stores.auth.get() !== undefined,
    now: () => Date.now(),
    registration: (id) => registrationFor(stores, id),
  }), [api, drafts, cache, stores]);

  const reactToggle = useMemo(() => createReactToggle({
    api, cache, now: () => Date.now(), registration: (id) => registrationFor(stores, id),
  }), [api, cache, stores]);

  // A tiny per-episode version counter so screens re-render when the cache changes.
  const [versions, setVersions] = useState<Record<string, { n: number; stale: boolean }>>({});
  const bump = useCallback((episodeId: string, stale = false) =>
    setVersions((v) => ({ ...v, [episodeId]: { n: (v[episodeId]?.n ?? 0) + 1, stale } })), []);
  const refresh = useCallback(async (episodeId: string) => {
    try {
      const r = await api.social(episodeId, cache.get(episodeId)?.etag);
      if (r.status === 200) cache.put(episodeId, r.body, r.etag, Date.now());
      bump(episodeId, false);
      return { social: r.status === 200 ? r.body : cache.get(episodeId)?.social, stale: false };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') {
        // Seen on the phone 2026-09-21: an episode nobody has registered yet is not
        // "couldn't refresh" — it is simply empty.
        const empty: Social = { serverTime: new Date().toISOString(), episode: { id: episodeId, durationMs: null }, comments: [], heat: { available: false } };
        cache.put(episodeId, empty, undefined, Date.now());
        bump(episodeId, false);
        return { social: empty, stale: false };
      }
      bump(episodeId, true);
      return { social: cache.get(episodeId)?.social, stale: true };
    }
  }, [api, cache, bump]);
  const useEpisodeSocial = useCallback((episodeId: string | undefined) => {
    const v = episodeId ? versions[episodeId] : undefined;
    void v?.n;
    return { cached: episodeId ? cache.get(episodeId) : undefined, stale: v?.stale ?? false };
  }, [versions, cache]);

  const wrapped = useMemo<AuthApi>(() => ({
    current: auth.current,
    signUp: async (...a) => { const r = await auth.signUp(...a); setListener(r); return r; },
    signIn: async (...a) => { const r = await auth.signIn(...a); setListener(r); return r; },
    signOut: async () => { await auth.signOut(); setListener(undefined); },
    deleteAccount: async (p) => { await auth.deleteAccount(p); setListener(undefined); },
  }), [auth]);

  const value = useMemo(() => ({ api, auth: wrapped, listener, refreshListener, composer, reactToggle, cache, useEpisodeSocial, bump, refresh }),
    [api, wrapped, listener, refreshListener, composer, reactToggle, cache, useEpisodeSocial, bump, refresh]);
  return <SocialContext.Provider value={value}>{props.children}</SocialContext.Provider>;
}
