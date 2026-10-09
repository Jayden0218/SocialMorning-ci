// Buys on Google Play (Android) and finishes a purchase only after the server has granted it.
/**
 * M20 US6 (spec FR-020–FR-026; research R6). expo-iap 5.8.2 (MIT; Play Billing 9.1.0). The flow:
 * `buy` asks Google → Google answers through `purchaseUpdatedListener` → the purchase goes to the
 * server (`/v1/me/purchases/google`), which checks it with Google and grants it → only then
 * `finishTransaction` (consumed for a tip, kept for PLUS and shows). A purchase the server refused
 * is not finished, so Google refunds it within 3 days. `restore` sends what the store still holds
 * (a renewed PLUS, a purchase whose answer was lost) — the server grants each once.
 *
 * iPhone: nothing here runs (owner, 2026-10-06: no Apple program) — `ready` is false and Wallet
 * says "not available yet". Loaded only when the native module is in the build, so Jest and older
 * builds are safe. NOT VERIFIED: no Play account yet, so no purchase has ever run.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { canBuy, consumable, GIFT_TIERS, kindOf, PLUS, purchaseRequest, SHOW_TIERS, TIPS } from './products';
import type { PurchaseApi } from './purchase-api';
import { fnv1a64 } from '@socialmorning/social-core';
import { useSocial } from '@/social/context';

/**
 * M23 US4 (FR-008): every purchase carries Google's `obfuscatedAccountId` (expo-iap 5.8.2's
 * `RequestPurchaseAndroidProps` / `RequestSubscriptionAndroidProps` field) = a hash of the
 * buyer's listener id. The server (apps/api/src/db/repos/account/purchases.ts `accountHashOf`,
 * same formula) refuses a purchase token that carries another account's hash.
 */
export const accountHashOf = (listenerId: string): string => fnv1a64(`account|${listenerId}`);

/** Adds the account hash to the Google part of a purchase request. */
export function withAccount<R extends { request: { google: object } }>(req: R, listenerId: string | undefined): R {
  if (!listenerId) return req;
  return { ...req, request: { ...req.request, google: { ...req.request.google, obfuscatedAccountId: accountHashOf(listenerId) } } } as R;
}

type Iap = typeof import('expo-iap');
const loadIap = (): Iap | undefined => (Platform.OS === 'android' && requireOptionalNativeModule('ExpoIap') ? (require('expo-iap') as Iap) : undefined);

/** Which show a pending one-time purchase is for (Google echoes only the hash). */
const pendingShow = new Map<string, string>();

export type PlayStore = {
  ready: boolean;
  price: (productId: string) => string | undefined;
  buy: (productId: string, o?: { feedUrl?: string; profileId?: string }) => Promise<void>;
  restore: () => Promise<number>;
  /** The last thing granted (to refresh a page), or the last error, in plain words. */
  granted: string | undefined;
  error: string | undefined;
  /** M22 US14: the link of the gift just bought (share it), until the next purchase. */
  gift?: { code: string; url: string } | undefined;
};

export function usePlayStore(api: PurchaseApi, o: { serverReady: boolean; teen: boolean }): PlayStore {
  const iap = useMemo(loadIap, []);
  const listenerId = useSocial().listener?.listenerId;
  const ready = canBuy({ platform: Platform.OS, native: iap !== undefined, serverReady: o.serverReady, teen: o.teen });
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [offerToken, setOfferToken] = useState<string | undefined>(undefined);
  const [granted, setGranted] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [gift, setGift] = useState<{ code: string; url: string } | undefined>(undefined);

  const send = useCallback(async (p: { productId: string; purchaseToken?: string | null }, purchase: unknown): Promise<boolean> => {
    if (!iap || !p.purchaseToken) return false;
    const feedUrl = pendingShow.get(p.productId);
    const r = await api.sendGoogle({ productId: p.productId, purchaseToken: p.purchaseToken, ...(feedUrl ? { feedUrl } : {}) });
    if ('gift' in r && r.gift) setGift(r.gift);
    await iap.finishTransaction({ purchase: purchase as never, isConsumable: consumable(p.productId) });
    pendingShow.delete(p.productId);
    return true;
  }, [api, iap]);

  useEffect(() => {
    if (!ready || !iap) return;
    let live = true;
    const subs = [
      iap.purchaseUpdatedListener((p) => {
        void send(p, p).then(
          () => { if (live) { setError(undefined); setGranted(kindOf(p.productId) ?? p.productId); } },
          () => { if (live) setError("Your purchase didn't go through on our side. You were not charged if Google shows it as pending; otherwise it is refunded within 3 days."); },
        );
      }),
      iap.purchaseErrorListener((e) => { if (live && !/cancel/i.test(String(e.code ?? e.message))) setError('The purchase did not finish. Nothing was charged.'); }),
    ];
    void (async () => {
      try {
        await iap.initConnection();
        const subsList = (await iap.fetchProducts({ skus: [PLUS], type: 'subs' })) ?? [];
        const once = (await iap.fetchProducts({ skus: [...SHOW_TIERS, ...GIFT_TIERS, ...TIPS], type: 'in-app' })) ?? [];
        if (!live) return;
        const next: Record<string, string> = {};
        for (const p of [...subsList, ...once] as { id: string; displayPrice: string; subscriptionOffers?: { offerTokenAndroid?: string | null }[] | null }[]) {
          next[p.id] = p.displayPrice;
          if (p.id === PLUS) setOfferToken(p.subscriptionOffers?.find((x) => x.offerTokenAndroid)?.offerTokenAndroid ?? undefined);
        }
        setPrices(next);
      } catch {
        if (live) setError("Couldn't reach Google Play.");
      }
    })();
    return () => { live = false; for (const s of subs) s.remove(); };
  }, [ready, iap, send]);

  const buy = useCallback(async (productId: string, b: { feedUrl?: string; profileId?: string } = {}) => {
    if (!ready || !iap) return;
    setError(undefined);
    setGift(undefined);
    if (b.feedUrl) pendingShow.set(productId, b.feedUrl);
    try {
      await iap.requestPurchase(withAccount(purchaseRequest(productId, { ...(offerToken ? { offerToken } : {}), ...(b.profileId ? { profileId: b.profileId } : {}) }), listenerId) as never);
    } catch (e) {
      pendingShow.delete(productId);
      setError(e instanceof Error && /offer/.test(e.message) ? 'PLUS is not on sale in the store yet.' : 'The purchase did not start. Try again.');
    }
  }, [ready, iap, offerToken, listenerId]);

  const restore = useCallback(async () => {
    if (!ready || !iap) return 0;
    let n = 0;
    for (const p of (await iap.getAvailablePurchases()) ?? []) {
      try { if (await send(p, p)) n++; } catch { /* the server refused one; the others still count */ }
    }
    if (n > 0) setGranted('restored');
    return n;
  }, [ready, iap, send]);

  return { ready, price: (id) => prices[id], buy, restore, granted, error, gift };
}
