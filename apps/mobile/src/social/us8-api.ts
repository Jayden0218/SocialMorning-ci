// Server calls for text statuses, my subscription order, and others' public subscriptions.
/**
 * M21 US8 (specs/022-m21-the-xiaoyuzhou-gaps/contracts/api.md). Its own client, like `m12-api.ts`,
 * so the many test fakes of `ApiClient` need no new methods. Same transport as `createApi`.
 *
 * - A text status is `POST /v1/voice-posts` with JSON `{ body }` (1–140 characters, gone at 24 h).
 * - My "Default" order: `PUT /v1/me/subscriptions/order { feedUrls }`, read back with GET.
 * - Someone's subscriptions: `GET /v1/listeners/:id/subscriptions`; 403 `private` → `{ private: true }`.
 */
import { useMemo } from 'react';
import { ApiError, requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

/** The server refuses a text status over 140 characters (code points, as `[...s].length` counts). */
export const TEXT_STATUS_MAX = 140;
export const textLength = (s: string): number => [...s.trim()].length;

export type PublicShow = { feedUrl: string; title: string | null; imageUrl: string | null };
export type ListenerSubscriptions = { private: true } | { private: false; items: PublicShow[] };

export type Us8Api = ReturnType<typeof createUs8Api>;

export function createUs8Api(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  return {
    postTextStatus: async (body: string) => (await call<{ id: string; body: string; expiresAt: string }>('POST', '/v1/voice-posts', { body: body.trim() })).json,
    subscriptionOrder: async () => (await call<{ feedUrls: string[] }>('GET', '/v1/me/subscriptions/order')).json.feedUrls,
    setSubscriptionOrder: async (feedUrls: readonly string[]) => { await call('PUT', '/v1/me/subscriptions/order', { feedUrls }); },
    listenerSubscriptions: async (listenerId: string): Promise<ListenerSubscriptions> => {
      try {
        return { private: false, items: (await call<{ items: PublicShow[] }>('GET', `/v1/listeners/${enc(listenerId)}/subscriptions`)).json.items };
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) return { private: true };
        throw e;
      }
    },
  };
}

export function useUs8Api(): Us8Api {
  return useMemo(() => createUs8Api({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
