// Server calls for the synced playlist and for deleting listening history.
/**
 * M22 US4 + US8 (specs/023-m22-the-xiaoyuzhou-gaps-2/contracts/api.md "Queue", "History").
 * Its own client, like `m19-api.ts`, so the many test fakes of `ApiClient` need no new methods.
 */
import { useMemo } from 'react';
import { ApiError, requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type ServerQueue = { items: string[]; version: number; deviceId: string | null; updatedAt: string | null };
export type PutQueueResult = { ok: true; version: number } | { ok: false; server: ServerQueue };

/** FR-026: at most this many history items per delete. */
export const HISTORY_DELETE_MAX = 100;

export type M22LibraryApi = ReturnType<typeof createM22LibraryApi>;

/** The account's list from a 409 answer (the requester puts the body's fields in `extra`). */
export function conflictQueue(e: ApiError): ServerQueue {
  const x = e.extra;
  const items = Array.isArray(x['items']) ? (x['items'] as unknown[]).filter((i): i is string => typeof i === 'string') : [];
  return {
    items,
    version: typeof x['version'] === 'number' ? x['version'] : 0,
    deviceId: typeof x['deviceId'] === 'string' ? x['deviceId'] : null,
    updatedAt: typeof x['updatedAt'] === 'string' ? x['updatedAt'] : null,
  };
}

export function createM22LibraryApi(deps: ApiDeps) {
  const call = requester(deps);
  return {
    getQueue: async () => (await call<ServerQueue>('GET', '/v1/me/queue')).json,
    /** 409 (the account moved on since `baseVersion`) is an answer, not an error: `{ ok: false, server }`. */
    putQueue: async (items: readonly string[], baseVersion: number, deviceId: string): Promise<PutQueueResult> => {
      try {
        const r = await call<{ version: number }>('PUT', '/v1/me/queue', { items, baseVersion, deviceId });
        return { ok: true, version: r.json.version };
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) return { ok: false, server: conflictQueue(e) };
        throw e;
      }
    },
    /** 1–100 episode ids, or every item. Listening totals stay (guard G-M22-14). */
    deleteHistory: async (what: { episodeIds: readonly string[] } | { all: true }) => { await call('DELETE', '/v1/me/history', what); },
    /** The episodes the account still has a position for — what another phone's delete left. */
    positionIds: async () => new Set((await call<{ positions: { episodeId: string }[] }>('GET', '/v1/me/positions')).json.positions.map((p) => p.episodeId)),
  };
}

export function useM22LibraryApi(): M22LibraryApi {
  return useMemo(() => createM22LibraryApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
