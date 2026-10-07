// Server calls for M22's interests, "Not liking these?", tell-the-editors, shared show lists and often listened.
/**
 * M22 lane 4 (specs/023-m22-the-xiaoyuzhou-gaps-2/contracts/api.md "Interests" and "Small items").
 * Its own client, like `us8-api.ts`, so the test fakes of `ApiClient` need no new methods.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type RecFeedbackReason = 'familiar' | 'topics' | 'long' | 'other';
export type OftenListenedShow = { feedUrl: string; title: string; imageUrl: string | null; listenedMs: number };
export type OftenListened = { shows: OftenListenedShow[]; hidden?: boolean };

export type M22DiscoverApi = ReturnType<typeof createM22DiscoverApi>;

export function createM22DiscoverApi(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  return {
    interests: async () => (await call<{ genreIds: number[]; skippedAt: string | null }>('GET', '/v1/me/interests')).json,
    setInterests: async (genreIds: readonly number[]) => { await call('PUT', '/v1/me/interests', { genreIds }); },
    skipInterests: async () => { await call('PUT', '/v1/me/interests', { skip: true }); },
    recFeedback: async (b: { reason: RecFeedbackReason; note?: string; add?: number[]; remove?: number[] }) => { await call('POST', '/v1/me/rec-feedback', b); },
    tellEditors: async (q: string) => { await call('POST', '/v1/search-requests', { q: q.trim().slice(0, 200) }); },
    shareList: async (title: string, feedUrls: readonly string[]) => (await call<{ id: string; url: string }>('POST', '/v1/me/shared-lists', { title: title.trim(), feedUrls })).json,
    /** The profile's often-listened row (and, on your own profile, whether it is hidden from others). */
    oftenListened: async (listenerId: string): Promise<OftenListened> => {
      const p = (await call<{ profile: { oftenListened?: OftenListenedShow[]; hideOftenListened?: boolean } }>('GET', `/v1/listeners/${enc(listenerId)}`)).json.profile;
      return { shows: p.oftenListened ?? [], ...(p.hideOftenListened !== undefined ? { hidden: p.hideOftenListened } : {}) };
    },
    setHideOftenListened: async (hidden: boolean) => { await call('PUT', '/v1/me/privacy', { hideOftenListened: hidden }); },
  };
}

export function useM22DiscoverApi(): M22DiscoverApi {
  return useMemo(() => createM22DiscoverApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
