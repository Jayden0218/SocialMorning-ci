// Server calls for M21 Discover: the three charts, treasure hunt, plaza, daily picks, like posts, dated search.
/**
 * M21 US7 (specs/022-m21-the-xiaoyuzhou-gaps/contracts/api.md), in its own client like
 * `m12-api.ts`, so the many test fakes of `ApiClient` need no new methods. Same transport.
 * The treasure hunt, the plaza and the like post are OUR OWN DESIGN (owner, 2026-10-06).
 */
import { useMemo } from 'react';
import { requester, type ApiDeps, type DiscoverItem, type EpisodeCard, type ShowCard } from '@/social/api';
import { apiBaseUrl } from '@/social/base-url';
import { secureToken } from '@/social/token';
import type { LikeItem } from '@/social/profile-api';

export type ChartKind = 'talked' | 'new' | 'rising';
export type ExploreChartItem = { key: string; rank: number; score?: number; reason?: string; episode: EpisodeCard };
export type ChartPage = { kind: ChartKind; items: ExploreChartItem[]; updatedAt: string };
export type Hunt = { day: string; shuffle: number; items: EpisodeCard[] };
export type PlazaShow = { feedUrl: string; title: string; imageUrl?: string; episodes: number; firstAt: string };
export type PlazaPage = { shuffle: number; items: PlazaShow[]; next?: string };
export type DailyPick = { feedUrl: string; guid?: string; why: string; episode: EpisodeCard | null };
export type Daily = { date?: string; items: DailyPick[] };
/** A face on an editor's pick: someone I follow who liked it (≤ 3 per pick). */
export type Face = { id: string; displayName: string; avatarUrl?: string };
export type PickWithFaces = DiscoverItem & { likedBy?: Face[] };
export type LikeComment = { id: string; author: { id: string; displayName: string; avatarUrl?: string }; body: string; createdAt: string; mine: boolean };
export type LikePost = { like: LikeItem; comments: LikeComment[]; reactions: { counts: { emoji: string; n: number }[]; mine?: string } };
export type SearchSince = 'any' | '30d' | '180d';
export type RichEpisode = EpisodeCard & { stats?: { listeners: number; comments: number } };
export type DatedSearch = { shows: ShowCard[]; episodes: RichEpisode[]; episodeSearch: 'ok' | 'unavailable' };

/** The phone's own limit, the same as the server's (`like_comments.body`). */
export const LIKE_COMMENT_MAX = 280;
export const CHART_LABELS: Record<ChartKind, string> = { talked: 'Talked about', new: 'New shows', rising: 'Rising' };

export type ExploreApi = ReturnType<typeof createExploreApi>;

export function createExploreApi(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  const likePath = (owner: string, episode: string) => `/v1/likes/${enc(owner)}/${enc(episode)}`;
  return {
    chart: async (kind: ChartKind, limit = 100) => (await call<ChartPage>('GET', `/v1/discover/chart?kind=${kind}&limit=${limit}`)).json,
    hunt: async (shuffle = 0) => (await call<Hunt>('GET', `/v1/discover/hunt?shuffle=${shuffle}`)).json,
    plaza: async (cursor?: string, shuffle = 0) => (await call<PlazaPage>('GET', `/v1/discover/plaza?shuffle=${shuffle}${cursor ? `&cursor=${enc(cursor)}` : ''}`)).json,
    daily: async () => (await call<Daily>('GET', '/v1/discover/daily')).json,
    likePost: async (owner: string, episode: string) => (await call<LikePost>('GET', likePath(owner, episode))).json,
    commentOnLike: async (owner: string, episode: string, body: string) => (await call<LikeComment>('POST', `${likePath(owner, episode)}/comments`, { body })).json,
    deleteLikeComment: async (owner: string, episode: string, id: string) => { await call('DELETE', `${likePath(owner, episode)}/comments/${enc(id)}`); },
    reactToLike: async (owner: string, episode: string, emoji: string) => { await call('PUT', `${likePath(owner, episode)}/reactions`, { emoji }); },
    clearLikeReaction: async (owner: string, episode: string) => { await call('DELETE', `${likePath(owner, episode)}/reactions`); },
    /** M21 T087: search with the date filter; `any` sends none. */
    search: async (q: string, since: SearchSince) => (await call<DatedSearch>('GET', `/v1/search?q=${enc(q)}${since === 'any' ? '' : `&since=${since}`}`)).json,
  };
}

export function useExploreApi(): ExploreApi {
  return useMemo(() => createExploreApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
