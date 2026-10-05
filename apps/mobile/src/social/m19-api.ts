// Server calls for playlists, notices from hosts, the monthly report and the teen-mode reset.
/**
 * M19 (specs/020-m19-the-rest-of-xiaoyuzhou/contracts/api.md): playlists (US4), the monthly
 * report (US8), the teen-mode passcode reset by email code (US9) and announcements from the
 * shows you follow (US10). Its own client, like `m12-api.ts`, so the many test fakes of
 * `ApiClient` need no new methods. Same transport as `createApi`.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps, type EpisodeCard } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

/** FR-030: the server refuses more (409 over 50 playlists, 300 episodes each). */
export const PLAYLIST_TITLE_MAX = 60;
export const PLAYLIST_MAX = 50;
export const PLAYLIST_ITEMS_MAX = 300;

export type PlaylistOwner = { id: string; displayName: string; avatarUrl?: string };
export type Playlist = {
  id: string;
  title: string;
  isPublic: boolean;
  count: number;
  updatedAt: string;
  imageUrl?: string;
  owner?: PlaylistOwner;
  /** Only on GET /v1/playlists/:id (and PUT/POST items, which answer the whole playlist). */
  items?: EpisodeCard[];
};
export type HostNotice = { id: string; feedUrl: string; showTitle: string; imageUrl?: string; body: string; images: string[]; releaseAt: string };
export type HostNoticesPage = { items: HostNotice[]; next?: string };
export type MonthReport = {
  month: string;
  minutes: number;
  shows: number;
  episodes: number;
  topShows: { feedUrl: string; title: string; imageUrl?: string; minutes: number }[];
  topEpisodes: { id: string; title: string; showTitle: string; imageUrl?: string; minutes: number }[];
  comments: number;
  clips: number;
};

export type M19Api = ReturnType<typeof createM19Api>;

export function createM19Api(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  return {
    myPlaylists: async () => (await call<{ items: Playlist[] }>('GET', '/v1/me/playlists')).json.items,
    createPlaylist: async (title: string, isPublic?: boolean) => (await call<Playlist>('POST', '/v1/me/playlists', { title, ...(isPublic !== undefined ? { isPublic } : {}) })).json,
    updatePlaylist: async (id: string, patch: { title?: string; isPublic?: boolean }) => (await call<Playlist>('PATCH', `/v1/me/playlists/${enc(id)}`, patch)).json,
    deletePlaylist: async (id: string) => { await call('DELETE', `/v1/me/playlists/${enc(id)}`); },
    /** The full ordered list (≤ 300): reorder and remove both send it. */
    setPlaylistItems: async (id: string, episodeIds: readonly string[]) => (await call<Playlist>('PUT', `/v1/me/playlists/${enc(id)}/items`, { episodeIds })).json,
    /** Appended at the end; the server ignores a duplicate. */
    addToPlaylist: async (id: string, episodeId: string) => (await call<Playlist>('POST', `/v1/me/playlists/${enc(id)}/items`, { episodeId })).json,
    /** Anyone's public playlist, or your own; 404 (`not_found`) for someone else's private one. */
    playlist: async (id: string) => (await call<Playlist>('GET', `/v1/playlists/${enc(id)}`)).json,
    listenerPlaylists: async (listenerId: string) => (await call<{ items: Playlist[] }>('GET', `/v1/listeners/${enc(listenerId)}/playlists`)).json.items,
    hostNotices: async (before?: string) => (await call<HostNoticesPage>('GET', `/v1/me/host-notices${before ? `?before=${enc(before)}` : ''}`)).json,
    report: async (month: string) => (await call<MonthReport>('GET', `/v1/me/report?month=${enc(month)}`)).json,
    /** FR-061: emails a 6-digit code to the account's address. */
    teenResetStart: async () => { await call('POST', '/v1/me/teen-reset/start'); },
    /** 204 when the code is right; a wrong one throws an ApiError with status 400. */
    teenResetCheck: async (code: string) => { await call('POST', '/v1/me/teen-reset/check', { code }); },
  };
}

export function useM19Api(): M19Api {
  return useMemo(() => createM19Api({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}

/** `2026-09` for the month before `now` (the report Me links to). */
export function lastMonth(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `2026-09` → "September 2026"; anything else is shown as given. */
export function monthName(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
