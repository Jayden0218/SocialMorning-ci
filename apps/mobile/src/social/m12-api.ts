// Extra server calls: likes, friends listening, picks, purchases, tips, voice posts.
/**
 * M12's server calls (specs/012-m12-the-finish/contracts/api.md), in their own client so the
 * many test fakes of `ApiClient` need no new methods. Same transport as `createApi`.
 */
import { useMemo } from 'react';
import { typedAudio } from './comment-extras-api';
import { requester, type ApiDeps, type EpisodeCard } from './api';
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
export type VoicePost = { id: string; author: { id: string; name: string; initials: string | null }; /** M21 US8: absent on a text status. */ url?: string; /** M21 US8: a text status (≤ 140 characters, no audio). */ body?: string; durationMs: number; createdAt: string; expiresAt: string; mine?: boolean; /** M20 US3: what the phone heard, as the author checked it. */ text?: string };

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
    /** FR-104: the recording as it was made (m4a), ≤ 60 s — raw bytes (M23 US9: through the shared helper's `raw`). */
    /** M20 US3: `transcript` = the text the listener checked; sent URI-encoded in `x-transcript`. */
    postVoice: async (file: Blob, durationMs: number, transcript?: string): Promise<{ id: string; url: string; expiresAt: string }> =>
      (await call.raw<{ id: string; url: string; expiresAt: string }>('POST', '/v1/voice-posts', typedAudio(file), {
        'content-type': 'audio/mp4', 'x-duration-ms': String(Math.round(durationMs)), ...(transcript ? { 'x-transcript': encodeURIComponent(transcript) } : {}),
      })).json,
    /** FR-034: the server draws the card; the phone downloads it and hands the file to the share sheet. */
    shareCardUrl: (episodeId: string, atMs?: number) => `${deps.baseUrl}/v1/share/episode/${enc(episodeId)}.png${atMs !== undefined ? `?t=${Math.round(atMs)}` : ''}`,
    /** M20 US1 (FR-001): the same card with lines from the transcript as a quote (≤ 280 characters). */
    shareQuoteUrl: (episodeId: string, text: string, atMs?: number) => `${deps.baseUrl}/v1/share/quote/${enc(episodeId)}.png?q=${encodeURIComponent(text)}${atMs !== undefined ? `&t=${Math.round(atMs)}` : ''}`,
    /** NEW-8: the page a shared episode opens (not the publisher's raw audio URL); M20: at a moment with `atMs`. */
    episodePageUrl: (episodeId: string, atMs?: number) => `${deps.baseUrl}/e/${enc(episodeId)}${atMs !== undefined ? `?t=${Math.round(atMs)}` : ''}`,
  };
}

export function useM12Api(): M12Api {
  return useMemo(() => createM12Api({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
