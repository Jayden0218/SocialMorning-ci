// Fetches launch promotions and reports views and taps, without user identity.
/**
 * M15 US3: the two public launch-screen calls (specs/015-m15-admin/contracts/admin-api.md).
 *
 * Neither sends the session token: the server keeps only a total per promotion and needs
 * to know nobody (FR-017, constitution v2.4.0 — "no per-person tracking").
 */
import { requester, type ApiDeps } from '@/social/api';
import type { Promotion } from './choose';

export type LaunchApi = {
  list(): Promise<Promotion[]>;
  event(id: string, kind: 'impression' | 'tap'): Promise<void>;
};

export function createLaunchApi(deps: Pick<ApiDeps, 'baseUrl' | 'fetch' | 'timeoutMs'>): LaunchApi {
  const call = requester({ ...deps, getToken: async () => undefined });
  return {
    list: async () => (await call<{ items?: Promotion[] }>('GET', '/v1/launch')).json?.items ?? [],
    event: async (id, kind) => { await call('POST', `/v1/launch/${encodeURIComponent(id)}/events`, { kind }); },
  };
}
