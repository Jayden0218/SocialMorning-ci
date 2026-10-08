// Server calls for the account: redeem a code, change the sign-in email.
/**
 * M24 lane A3 (spec 025): US15 redeem codes, US16 change the sign-in email. Its own client (like
 * m12-api) so the many test fakes of `ApiClient` need no new methods. Same transport as `createApi`.
 * A redeem code is a free grant made by the owner — nothing here buys anything.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type RedeemGrant = { kind: 'plus'; days: number; until: string | null } | { kind: 'show'; feedUrl: string; title: string | null };

export type AccountApi = ReturnType<typeof createAccountApi>;

export function createAccountApi(deps: ApiDeps) {
  const call = requester(deps);
  return {
    /** POST /v1/me/redeem — 404 no such code, 409 already used / already yours, 410 off or used up, 429 too many tries. */
    redeem: async (code: string) => (await call<{ grant: RedeemGrant }>('POST', '/v1/me/redeem', { code: cleanCode(code) })).json.grant,
    /** POST /v1/me/email/start — a code goes to the NEW address. */
    startEmailChange: async (email: string) => (await call<{ sent: true; resendAfterSeconds: number }>('POST', '/v1/me/email/start', { email: email.trim() })).json,
    /**
     * POST /v1/me/email/confirm — the right code switches the sign-in email; the old address is told.
     * M24 fix F-P: the server also signs out every other device and says how many (`signedOut`;
     * absent on an older server → 0).
     */
    confirmEmailChange: async (code: string): Promise<{ email: string; signedOut: number }> => {
      const r = (await call<{ email: string; signedOut?: number }>('POST', '/v1/me/email/confirm', { code: code.trim() })).json;
      return { email: r.email, signedOut: typeof r.signedOut === 'number' && r.signedOut > 0 ? r.signedOut : 0 };
    },
  };
}

export function useAccountApi(): AccountApi {
  return useMemo(() => createAccountApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}

/** M24 fix F-P: the toast after a change — "Email changed. Signed out of N other devices." (N = 0: just "Email changed."). */
export function emailChangedLine(signedOut: number): string {
  if (signedOut <= 0) return 'Email changed.';
  return `Email changed. Signed out of ${signedOut} other ${signedOut === 1 ? 'device' : 'devices'}.`;
}

/** What the person typed, upper case, without spaces and dashes (the server does the same). */
export const cleanCode = (raw: string): string => raw.toUpperCase().replace(/[\s-]/g, '');

/** A code is 12 symbols; the button wakes up at 6 so an older or shorter code still works. */
export const codeReady = (raw: string): boolean => /^[A-Z0-9]{6,32}$/.test(cleanCode(raw));

/** "ABCDEFGHJKMN" → "ABCD-EFGH-JKMN", for the field as it is typed. */
export const groupCode = (raw: string): string => (cleanCode(raw).slice(0, 32).match(/.{1,4}/g) ?? []).join('-');

/** The line shown after a code worked. */
export function grantLine(g: RedeemGrant, date: (iso: string) => string): string {
  if (g.kind === 'plus') return g.until ? `PLUS is yours until ${date(g.until)}.` : `${g.days} days of PLUS added.`;
  return `${g.title ?? 'The series'} is yours. Find it on the show page.`;
}

export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
