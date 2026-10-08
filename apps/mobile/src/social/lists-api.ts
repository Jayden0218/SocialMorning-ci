// Server call for one shared show list (GET /v1/lists/:id), and checking what came back.
/**
 * M24 US1: the phone's own page for a shared list (app/lists/[id].tsx), so a list someone shared
 * can be read in the app and reported. The list is public; the call needs no session.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type SharedList = { id: string; title: string; owner: { id: string; displayName: string }; shows: { feedUrl: string; title: string; imageUrl: string | null }[] };

/** The server's answer → a list, or undefined when it is not one. Shows without a feed address are dropped. */
export function parseSharedList(body: unknown): SharedList | undefined {
  const b = body as { id?: unknown; title?: unknown; owner?: { id?: unknown; displayName?: unknown }; shows?: unknown } | null;
  if (!b || typeof b.id !== 'string' || typeof b.title !== 'string' || typeof b.owner?.id !== 'string' || typeof b.owner.displayName !== 'string') return undefined;
  const shows = (Array.isArray(b.shows) ? b.shows : []).flatMap((raw) => {
    const s = raw as { feedUrl?: unknown; title?: unknown; imageUrl?: unknown } | null;
    if (!s || typeof s.feedUrl !== 'string') return [];
    return [{ feedUrl: s.feedUrl, title: typeof s.title === 'string' ? s.title : s.feedUrl, imageUrl: typeof s.imageUrl === 'string' ? s.imageUrl : null }];
  });
  return { id: b.id, title: b.title, owner: { id: b.owner.id, displayName: b.owner.displayName }, shows };
}

export function createListsApi(deps: ApiDeps) {
  const call = requester(deps);
  return {
    get: async (id: string): Promise<SharedList | undefined> => parseSharedList((await call<unknown>('GET', `/v1/lists/${encodeURIComponent(id)}`)).json),
  };
}

export function useListsApi(): ReturnType<typeof createListsApi> {
  return useMemo(() => createListsApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
