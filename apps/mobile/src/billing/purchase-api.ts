// Server calls for purchases: send a Google Play purchase, read a show's paid episodes, get a play link.
/**
 * M20 US6 (contracts/api.md "Purchases"). The phone never grants anything itself: it sends the
 * store's purchase to the server, which checks it with Google; only then is the purchase finished.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from '@/social/api';
import { apiBaseUrl } from '@/social/base-url';
import { secureToken } from '@/social/token';

export type PaidList = {
  forSale: boolean;
  productId?: string;
  profileId?: string;
  bought?: boolean;
  items: { id: string; episodeId: string; title: string; description: string; durationMs: number | null; publishedAt: string; coverUrl: string | null }[];
};

export function createPurchaseApi(deps: ApiDeps) {
  const call = requester(deps);
  return {
    sendGoogle: async (b: { productId: string; purchaseToken: string; feedUrl?: string }) =>
      (await call<{ purchase: { kind: string; status: string; repeated: boolean } }>('POST', '/v1/me/purchases/google', b)).json.purchase,
    paid: async (feedUrl: string) => (await call<PaidList>('GET', `/v1/hosted/paid?feedUrl=${encodeURIComponent(feedUrl)}`)).json,
    access: async (hostedEpisodeId: string) => (await call<{ url: string; expiresAt: string }>('GET', `/v1/hosted/episodes/${encodeURIComponent(hostedEpisodeId)}/access`)).json,
  };
}
export type PurchaseApi = ReturnType<typeof createPurchaseApi>;

export function usePurchaseApi(): PurchaseApi {
  return useMemo(() => createPurchaseApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
