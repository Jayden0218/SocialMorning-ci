// Server call for the Moments feed: the hottest moments of episodes you follow, then of the chart.
/**
 * M31 T025 (specs/033-m31-redesign/contracts/moments.md). `GET /v1/discover/moments?limit=&cursor=`
 * is read-only and works signed out (the chart only). In its own client, like `explore-api.ts`, so
 * the many test fakes of `ApiClient` need no new method. Same transport.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from '@/social/api';
import { apiBaseUrl } from '@/social/base-url';
import { secureToken } from '@/social/token';

export type MomentComment = { id: string; author: string; text: string; likes: number };
/** One moment: a bucket of one episode that many people marked. `coverUrl` is absent when unknown. */
export type Moment = {
  episodeId: string;
  showTitle: string;
  episodeTitle: string;
  /** The episode in its feed. Present from the server of 2026-10-27; an older reply lacks them and the phone looks the card up in the chart. */
  feedUrl?: string;
  guid?: string;
  enclosureUrl?: string;
  coverUrl?: string;
  startMs: number;
  endMs: number;
  reactions: number;
  rank: number;
  followed: boolean;
  /** The episode's whole heat curve, 100 integers 0..100 (wave 5b). Absent from an older server: the phone then draws peaks / its own heat read. */
  curve?: number[];
  comments: MomentComment[];
};
export type MomentsPage = { items: Moment[]; next?: string; computedAt: string };

export type MomentsApi = ReturnType<typeof createMomentsApi>;

export function createMomentsApi(deps: ApiDeps) {
  const call = requester(deps);
  return {
    /** `feedUrl`: only that show's newest episodes (the Show screen's Hot moments tab; contract `moments.md`, per-show filter). */
    list: async (opts: { limit?: number; cursor?: string; feedUrl?: string } = {}): Promise<MomentsPage> => {
      const q = new URLSearchParams();
      q.set('limit', String(opts.limit ?? 20));
      if (opts.cursor) q.set('cursor', opts.cursor);
      if (opts.feedUrl) q.set('feedUrl', opts.feedUrl);
      return (await call<MomentsPage>('GET', `/v1/discover/moments?${q.toString()}`)).json;
    },
  };
}

export function useMomentsApi(): MomentsApi {
  return useMemo(() => createMomentsApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
