// Talks to Google Play for purchases: checks a purchase, acknowledges it, and lists refunds.
/**
 * M20 US6 (spec FR-020–FR-026; research R6; constitution V: "every purchase MUST be verified with
 * the store on the server before anything is granted, and withdrawn when the store reports a
 * refund"). Google Play Developer API v3, field names read from its reference on 2026-10-06:
 *  - subscriptions: GET purchases/subscriptionsv2/tokens/{token} → subscriptionState
 *    (SUBSCRIPTION_STATE_ACTIVE …), acknowledgementState (ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED …),
 *    lineItems[].productId / expiryTime, externalAccountIdentifiers.obfuscatedExternalProfileId,
 *    latestOrderId; acknowledge: POST purchases/subscriptions/{productId}/tokens/{token}:acknowledge
 *  - one-time: GET purchases/products/{productId}/tokens/{token} → purchaseState (0 bought,
 *    1 cancelled, 2 pending), acknowledgementState (0/1), orderId, obfuscatedExternalProfileId;
 *    acknowledge: POST …/products/{productId}/tokens/{token}:acknowledge
 *  - refunds: GET purchases/voidedpurchases?startTime&type=1 → voidedPurchases[].purchaseToken,
 *    voidedTimeMillis; tokenPagination.nextPageToken (30 days back at most). No Pub/Sub (R6).
 * Auth: the service account's JWT (RS256, signed here with node:crypto — no SDK) exchanged at
 * oauth2.googleapis.com/token for an access token with the androidpublisher scope.
 *
 * Env (Vercel, never the repo): GOOGLE_PLAY_SA_JSON (the key file's JSON), GOOGLE_PLAY_PACKAGE
 * (app.socialmorning.mobile). Unset → `ready` false and Wallet says "not available yet".
 * NOT VERIFIED against Google: the owner has no Play account yet (owner 2026-10-06).
 */
import { createSign } from 'node:crypto';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export type GoogleSubscription = {
  state: string;
  acknowledged: boolean;
  productId: string | null;
  expiresAt: string | null;
  orderId: string | null;
  profileId: string | null;
  test: boolean;
};
export type GoogleProduct = {
  /** 0 bought, 1 cancelled, 2 pending */
  purchaseState: number;
  acknowledged: boolean;
  orderId: string | null;
  profileId: string | null;
  test: boolean;
};
export type Voided = { purchaseToken: string; voidedAt: number };

export interface GooglePlay {
  readonly ready: boolean;
  subscription(token: string): Promise<GoogleSubscription>;
  product(productId: string, token: string): Promise<GoogleProduct>;
  acknowledge(kind: 'subscription' | 'product', productId: string, token: string): Promise<void>;
  voided(sinceMs: number): Promise<Voided[]>;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** The service-account assertion (RFC 7523): RS256 over header.claims. Pure, for the test. */
export function serviceAccountJwt(sa: { client_email: string; private_key: string }, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

export function googlePlay(env: Record<string, string | undefined>, f: typeof fetch = fetch, now: () => number = Date.now): GooglePlay {
  const pkg = env['GOOGLE_PLAY_PACKAGE'];
  let sa: { client_email: string; private_key: string } | undefined;
  try { sa = env['GOOGLE_PLAY_SA_JSON'] ? JSON.parse(env['GOOGLE_PLAY_SA_JSON']) : undefined; } catch { sa = undefined; }
  const ready = Boolean(pkg && sa?.client_email && sa?.private_key);
  let cached: { token: string; until: number } | undefined;

  const accessToken = async (): Promise<string> => {
    if (!ready) throw new Error('Google Play is not connected');
    if (cached && cached.until > now() + 60_000) return cached.token;
    const assertion = serviceAccountJwt(sa!, Math.floor(now() / 1000));
    const r = await f(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}` });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!r.ok || !j.access_token) throw new Error(`Google token answered ${r.status}`);
    cached = { token: j.access_token, until: now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  };
  const call = async <T>(method: 'GET' | 'POST', path: string): Promise<T> => {
    const r = await f(`${API}/${encodeURIComponent(pkg!)}/${path}`, { method, headers: { authorization: `Bearer ${await accessToken()}`, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) });
    if (!r.ok) throw new GooglePlayError(r.status, `Google Play answered ${r.status}`);
    const text = await r.text();
    return (text ? JSON.parse(text) : {}) as T;
  };
  const enc = encodeURIComponent;

  return {
    ready,
    async subscription(token) {
      const j = await call<{ subscriptionState?: string; acknowledgementState?: string; lineItems?: { productId?: string; expiryTime?: string }[]; latestOrderId?: string; externalAccountIdentifiers?: { obfuscatedExternalProfileId?: string }; testPurchase?: object }>('GET', `purchases/subscriptionsv2/tokens/${enc(token)}`);
      const line = j.lineItems?.[0];
      return {
        state: j.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED',
        acknowledged: j.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        productId: line?.productId ?? null,
        expiresAt: line?.expiryTime ?? null,
        orderId: j.latestOrderId ?? null,
        profileId: j.externalAccountIdentifiers?.obfuscatedExternalProfileId ?? null,
        test: j.testPurchase !== undefined,
      };
    },
    async product(productId, token) {
      const j = await call<{ purchaseState?: number; acknowledgementState?: number; orderId?: string; obfuscatedExternalProfileId?: string; purchaseType?: number }>('GET', `purchases/products/${enc(productId)}/tokens/${enc(token)}`);
      return { purchaseState: j.purchaseState ?? -1, acknowledged: j.acknowledgementState === 1, orderId: j.orderId ?? null, profileId: j.obfuscatedExternalProfileId ?? null, test: j.purchaseType === 0 };
    },
    async acknowledge(kind, productId, token) {
      await call('POST', kind === 'subscription' ? `purchases/subscriptions/${enc(productId)}/tokens/${enc(token)}:acknowledge` : `purchases/products/${enc(productId)}/tokens/${enc(token)}:acknowledge`);
    },
    async voided(sinceMs) {
      const out: Voided[] = [];
      let page: string | undefined;
      for (let i = 0; i < 20; i++) {
        const j = await call<{ voidedPurchases?: { purchaseToken?: string; voidedTimeMillis?: string }[]; tokenPagination?: { nextPageToken?: string } }>('GET', `purchases/voidedpurchases?type=1&maxResults=1000&startTime=${Math.floor(sinceMs)}${page ? `&token=${enc(page)}` : ''}`);
        for (const v of j.voidedPurchases ?? []) if (v.purchaseToken) out.push({ purchaseToken: v.purchaseToken, voidedAt: Number(v.voidedTimeMillis ?? now()) });
        page = j.tokenPagination?.nextPageToken;
        if (!page) break;
      }
      return out;
    },
  };
}

export class GooglePlayError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
