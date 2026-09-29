/**
 * M12's server calls (specs/012-m12-the-finish/contracts/api.md), in their own client so the
 * many test fakes of `ApiClient` need no new methods. Same transport as `createApi`.
 */
import { useMemo } from 'react';
import { ApiError, requester, type ApiDeps, type EpisodeCard } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type LikeState = { likeCount: number; likedByMe: boolean };
export type FriendListen = { episode: EpisodeCard; listeners: { id: string; name: string; initials: string | null }[]; lastAt: string };
/** contracts/api.md FR-070: `episode` is null when the server cannot name the episode yet. */
export type PastPick = { feedUrl: string; guid?: string; why: string; episode: EpisodeCard | null };
export type PastPicksDay = { date: string; picks: PastPick[] };
/** contracts/api.md FR-071: the Talked-about ranking, un-truncated. */
export type ChartItem = { kind: 'talkedAbout'; key: string; rank: number; score: number; reason: string; episode: EpisodeCard };
export type IssueSummary = { id: string; date: string; title: string };
export type Issue = IssueSummary & { intro: string; items: { order: number; feedUrl: string; guid?: string; note: string; episode: EpisodeCard | null }[] };
export type NotifyShow = { feedUrl: string; title: string | null; enabled: boolean };
/** contracts/api.md FR-105/106 — read only; nothing here can buy anything. */
export type Purchase = { id: string; store: string; productId: string; status: string; expiresAt: string | null; amountMicros: number | null; currency: string | null; createdAt: string };
export type Tip = { id: string; feedUrl: string; showTitle: string | null; createdAt: string; amountMicros: number | null; currency: string | null };
export type VoicePost = { id: string; author: { id: string; name: string; initials: string | null }; url: string; durationMs: number; createdAt: string; expiresAt: string; mine?: boolean };

export type M12Api = ReturnType<typeof createM12Api>;

export function createM12Api(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  return {
    likeComment: async (id: string) => (await call<LikeState>('PUT', `/v1/comments/${id}/like`)).json,
    unlikeComment: async (id: string) => (await call<LikeState>('DELETE', `/v1/comments/${id}/like`)).json,
    /** FR-042: "I am playing this" — an install id, stored by the server only as a salted daily hash. */
    live: async (episodeId: string, installId: string) => { await call('PUT', `/v1/episodes/${episodeId}/live`, { installId }); },
    /** FR-080: comment counts for up to 100 episodes in one call (the Updates list). */
    commentCounts: async (ids: readonly string[]) => (await call<{ counts: Record<string, number> }>('POST', '/v1/episodes/comment-counts', { ids: ids.slice(0, 100) })).json.counts,
    /** FR-061: comments and listeners together, for the show page's rows. */
    episodeCounts: async (ids: readonly string[]) => (await call<{ counts: Record<string, number>; listeners?: Record<string, number> }>('POST', '/v1/episodes/comment-counts', { ids: ids.slice(0, 100) })).json,
    listeningNow: async (episodeId: string) => (await call<{ listeningNow: number }>('GET', `/v1/episodes/${episodeId}/live`)).json.listeningNow,
    friendsListening: async () => (await call<{ items: FriendListen[] }>('GET', '/v1/me/friends-listening')).json.items,
    pastPicks: async (before?: string) => (await call<{ days: PastPicksDay[]; next?: string }>('GET', `/v1/picks/past${before ? `?before=${enc(before)}` : ''}`)).json,
    issues: async () => (await call<{ issues: IssueSummary[] }>('GET', '/v1/issues')).json.issues,
    issue: async (id: string) => (await call<Issue>('GET', `/v1/issues/${enc(id)}`)).json,
    chart: async (limit = 100) => (await call<{ items: ChartItem[]; serverTime: string }>('GET', `/v1/discover/chart?limit=${limit}`)).json.items,
    notifyShows: async () => (await call<{ shows: NotifyShow[] }>('GET', '/v1/me/notify/shows')).json.shows,
    setNotifyShow: async (feedUrl: string, enabled: boolean) => { await call('PUT', `/v1/me/notify/shows/${enc(feedUrl)}`, { enabled }); },
    purchases: async () => (await call<{ items: Purchase[]; storeReady: boolean }>('GET', '/v1/me/purchases')).json,
    tips: async () => (await call<{ items: Tip[]; storeReady: boolean }>('GET', '/v1/me/tips')).json,
    voicePosts: async () => (await call<{ items: VoicePost[] }>('GET', '/v1/voice-posts?from=following')).json.items,
    deleteVoicePost: async (id: string) => { await call('DELETE', `/v1/voice-posts/${enc(id)}`); },
    /** FR-104: the recording as it was made (m4a), ≤ 60 s — raw bytes, so not through the JSON helper. */
    postVoice: async (file: Blob, durationMs: number): Promise<{ id: string; url: string; expiresAt: string }> => {
      const token = await deps.getToken();
      const res = await deps.fetch(`${deps.baseUrl}/v1/voice-posts`, {
        method: 'POST',
        headers: { 'content-type': 'audio/mp4', 'x-duration-ms': String(Math.round(durationMs)), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; id?: string; url?: string; expiresAt?: string };
      if (!res.ok) throw new ApiError((json.error as never) ?? 'internal', json.message ?? `Server answered ${res.status}.`, res.status);
      return json as { id: string; url: string; expiresAt: string };
    },
    /** FR-034: the server draws the card; the phone downloads it and hands the file to the share sheet. */
    shareCardUrl: (episodeId: string, atMs?: number) => `${deps.baseUrl}/v1/share/episode/${enc(episodeId)}.png${atMs !== undefined ? `?t=${Math.round(atMs)}` : ''}`,
    /** NEW-8: the page a shared episode opens (not the publisher's raw audio URL). */
    episodePageUrl: (episodeId: string) => `${deps.baseUrl}/e/${enc(episodeId)}`,
  };
}

export function useM12Api(): M12Api {
  return useMemo(() => createM12Api({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
