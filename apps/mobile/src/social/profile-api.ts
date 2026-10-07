// Server calls for your profile, photo, hidden recommendations and episode likes.
/**
 * M19 (specs/020-m19-the-rest-of-xiaoyuzhou/contracts/api.md): edit your profile and photo
 * (US1), "Not interested" (US2) and episode likes with the followed-accounts timeline (US3).
 * Its own client, like `m12-api.ts`, so the many test fakes of `ApiClient` need no new methods.
 * Same transport as `createApi`; the photo goes up as raw bytes, like a voice post.
 */
import { useMemo } from 'react';
import { ApiError, requester, type ApiDeps, type EpisodeCard, type Listener } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

/** The age ranges the server accepts (PATCH /v1/me `ageRange`). */
export const AGE_RANGES = ['under18', '18-24', '25-34', '35-44', '45-54', '55+'] as const;
export type AgeRange = (typeof AGE_RANGES)[number];
/** The genders the server accepts (PATCH /v1/me `gender`); `unsaid` is "Prefer not to say". */
export const GENDERS = ['woman', 'man', 'another', 'unsaid'] as const;
export type Gender = (typeof GENDERS)[number];

export const NAME_MAX = 30;
export const BIO_MAX = 160;
export const LIKE_NOTE_MAX = 140;
/** The server refuses a photo over 204 800 bytes. */
export const AVATAR_MAX_BYTES = 204_800;

/** M21 US8: the server refuses an industry over 40 characters. */
export const INDUSTRY_MAX = 40;

/** M21 US8: a real calendar date, YYYY-MM-DD, from 1900 to today — the server's own rule. */
export function birthdayOk(s: string, today: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= '1900-01-01' && d.getTime() <= today.getTime();
}

export type ProfilePatch = { displayName?: string; bio?: string; ageRange?: AgeRange | null; gender?: Gender | null; likesPublic?: boolean;
  /** M21 US8/US10: null clears birthday or industry. */
  birthday?: string | null; industry?: string | null;
  hideBadge?: boolean; hideStickers?: boolean; hideDecorations?: boolean; privateSubscriptions?: boolean };
/**
 * M21 US10 (PATCH /v1/me, the fields US8 adds on the server): what others see of you. Each is
 * off by default. `privacySwitchesOf` reads them from GET /v1/me's listener, whatever its type says.
 */
export type PrivacySwitches = { hideBadge?: boolean; hideStickers?: boolean; hideDecorations?: boolean; privateSubscriptions?: boolean };
export const PRIVACY_SWITCHES = ['hideBadge', 'hideStickers', 'hideDecorations', 'privateSubscriptions'] as const;
export function privacySwitchesOf(listener: unknown): Required<PrivacySwitches> {
  const l = (listener ?? {}) as Record<string, unknown>;
  return { hideBadge: l['hideBadge'] === true, hideStickers: l['hideStickers'] === true, hideDecorations: l['hideDecorations'] === true, privateSubscriptions: l['privateSubscriptions'] === true };
}
export type DismissalKind = 'episode' | 'show';
export type Dismissal = { kind: DismissalKind; itemKey: string; title?: string; createdAt: string };
export type EpisodeLike = { liked: boolean; note?: string };
export type LikeItem = { listener?: { id: string; displayName: string; avatarUrl?: string }; episode: EpisodeCard; note?: string; createdAt: string };
export type LikesPage = { items: LikeItem[]; next?: string };

export type ProfileApi = ReturnType<typeof createProfileApi>;

export function createProfileApi(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  const before = (b?: string) => (b ? `?before=${enc(b)}` : '');
  return {
    me: async () => (await call<{ listener: Listener }>('GET', '/v1/me')).json.listener,
    update: async (patch: ProfilePatch & PrivacySwitches) => (await call<{ listener: Listener }>('PATCH', '/v1/me', patch)).json.listener,
    /** PUT /v1/me/avatar — the JPEG's raw bytes, not JSON (M23 US9: through the shared helper's `raw`). */
    uploadAvatar: async (file: Blob): Promise<string> => {
      const r = await call.raw<{ avatarUrl?: string }>('PUT', '/v1/me/avatar', file, { 'content-type': 'image/jpeg' });
      if (!r.json?.avatarUrl) throw new ApiError('internal', `Server answered ${r.status}.`, r.status);
      return r.json.avatarUrl;
    },
    removeAvatar: async () => { await call('DELETE', '/v1/me/avatar'); },

    dismissals: async () => (await call<{ items: Dismissal[] }>('GET', '/v1/me/dismissals')).json.items,
    dismiss: async (kind: DismissalKind, itemKey: string) => { await call('PUT', '/v1/me/dismissals', { kind, itemKey }); },
    undismiss: async (kind: DismissalKind, itemKey: string) => { await call('DELETE', '/v1/me/dismissals', { kind, itemKey }); },

    episodeLike: async (episodeId: string) => (await call<EpisodeLike>('GET', `/v1/episodes/${enc(episodeId)}/like`)).json,
    like: async (episodeId: string, note?: string) => (await call<EpisodeLike>('PUT', `/v1/episodes/${enc(episodeId)}/like`, note ? { note: note.slice(0, LIKE_NOTE_MAX) } : {})).json,
    unlike: async (episodeId: string) => { await call('DELETE', `/v1/episodes/${enc(episodeId)}/like`); },
    likesTimeline: async (b?: string) => (await call<LikesPage>('GET', `/v1/me/likes/timeline${before(b)}`)).json,
    listenerLikes: async (listenerId: string, b?: string) => (await call<LikesPage>('GET', `/v1/listeners/${enc(listenerId)}/likes${before(b)}`)).json,
  };
}

export function useProfileApi(): ProfileApi {
  return useMemo(() => createProfileApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
