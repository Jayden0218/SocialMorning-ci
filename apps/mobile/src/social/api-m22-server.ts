// Server calls for M22 lane 5: bottom pins, the deletion wait, time zone, translated transcripts, gifts and the weekly digest.
/**
 * M22 (specs/023-m22-the-xiaoyuzhou-gaps-2/contracts/api.md). Its own client, like `us8-api.ts`,
 * so the test fakes of `ApiClient` need no new methods. Same transport as `createApi`.
 *
 * Also the one place that remembers a sign-in's `pendingDeletion` answer (US11): the auth code
 * writes it, the Keep / Continue sheet (`src/ui/auth/PendingDeletion.tsx`) reads it.
 */
import { useMemo } from 'react';
import type { Transcript } from '@socialmorning/player-core';
import { ApiError, requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type TranslatedLine = { s: number; e: number; o: string; t: string };
export type TranslationLang = 'en' | 'zh-Hans';
export type Translation =
  | { state: 'done'; lines: TranslatedLine[] }
  | { state: 'queued' | 'transcribing' | 'translating'; etaHours: number }
  | { state: 'none' | 'failed' }
  | { state: 'plus_required' }
  | { state: 'not_offered' };

export type GiftView = { show: { feedUrl: string; title: string; artworkUrl: string | null }; claimed: boolean; cancelled: boolean; buyerName: string | null };
export type ClaimResult = 'claimed' | 'already_claimed' | 'already_owned' | 'cancelled' | 'not_found';
export type MyGift = { code: string; url: string; feedUrl: string; title: string; claimed: boolean; cancelled: boolean; createdAt: string };
export type DigestEpisode = { id: string; feedUrl: string; guid: string; title: string; showTitle: string | null; enclosureUrl: string; imageUrl: string | null; durationMs: number | null; publishedAt: string | null };
export type Digest = { isoWeek: string; episodes: DigestEpisode[]; sentAt: string };

/** The phone's IANA zone (e.g. "Asia/Kuala_Lumpur"); undefined when the runtime cannot say. */
export function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}

export type M22Api = ReturnType<typeof createM22Api>;

export function createM22Api(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  const code = (e: unknown): string | undefined => (e instanceof ApiError ? (e.code as string) : undefined);
  return {
    /** US10: a verified host pins one comment per episode to the bottom (or unpins it). */
    pinBottom: async (commentId: string, on: boolean) => { await call(on ? 'PUT' : 'DELETE', `/v1/comments/${enc(commentId)}/pin-bottom`); },
    /** US11: Keep — cancel the deletion started on this account. */
    cancelDeletion: async () => { await call('POST', '/v1/me/deletion/cancel'); },
    /** US15: where Monday 12:00 is for this listener. */
    setTimeZone: async (tz: string) => { await call('PUT', '/v1/me/tz', { tz }); },
    /** US13: the translated transcript, or why there is none. */
    translation: async (episodeId: string, lang: TranslationLang): Promise<Translation> => {
      try {
        return (await call<Translation>('GET', `/v1/episodes/${enc(episodeId)}/translation?lang=${enc(lang)}`)).json;
      } catch (e) {
        const c = code(e);
        if (c === 'plus_required') return { state: 'plus_required' };
        if (c === 'not_offered' || c === 'not_found') return { state: 'not_offered' };
        throw e;
      }
    },
    requestTranslation: async (episodeId: string, lang: TranslationLang): Promise<Translation> =>
      (await call<Translation>('POST', `/v1/episodes/${enc(episodeId)}/translation`, { lang })).json,
    /** US14 */
    gift: async (giftCode: string) => (await call<GiftView>('GET', `/v1/gifts/${enc(giftCode)}`)).json,
    claimGift: async (giftCode: string): Promise<ClaimResult> => {
      try {
        await call('POST', `/v1/gifts/${enc(giftCode)}/claim`);
        return 'claimed';
      } catch (e) {
        const c = code(e);
        if (c === 'already_claimed' || c === 'already_owned' || c === 'cancelled' || c === 'not_found') return c;
        throw e;
      }
    },
    myGifts: async () => (await call<{ items: MyGift[] }>('GET', '/v1/me/gifts')).json.items,
    /** US15 */
    digests: async () => (await call<{ items: Digest[] }>('GET', '/v1/me/digests')).json.items,
  };
}

export function useM22Api(): M22Api {
  return useMemo(() => createM22Api({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}

// ---- US11: the sign-in answer's `pendingDeletion`, kept for the Keep / Continue sheet ----

export type PendingDeletion = { dueAt: string } | null;
let pending: PendingDeletion = null;
const listeners = new Set<() => void>();

export const pendingDeletionStore = {
  get: (): PendingDeletion => pending,
  set: (v: PendingDeletion) => { pending = v; for (const l of listeners) l(); },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};

/** "21 October 2026" — the date the account goes, in the phone's own words. */
export function dueDateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---- US13: which language to ask for ----

export function phoneLocale(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().locale; } catch { return 'en'; }
}

/** English, unless the show reads as English (Latin letters, no CJK) and the phone is set to Chinese. */
export function targetLang(original: Transcript | undefined, locale: string): TranslationLang {
  if (!/^zh/i.test(locale) || !original) return 'en';
  const text = 'lines' in original ? original.lines.slice(0, 40).map((l) => l.text).join(' ') : original.text.slice(0, 2000);
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g) ?? []).length;
  return latin > 0 && cjk === 0 ? 'zh-Hans' : 'en';
}
