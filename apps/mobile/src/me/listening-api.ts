// Server calls for listening data, sticker placements and the monthly recap picture.
/**
 * M21 US9 (specs/022-m21-the-xiaoyuzhou-gaps/contracts/api.md): `GET /v1/me/listening`,
 * `GET`/`PUT /v1/me/stickers/placements` and the recap card's URL (`/v1/share/recap/…`, drawn by
 * the server like the quote card). Its own client, like `m19-api.ts`, so the test fakes of
 * `ApiClient` need no new methods.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from '@/social/api';
import { apiBaseUrl } from '@/social/base-url';
import { secureToken } from '@/social/token';
import type { Placement } from '@socialmorning/social-core';

export type ListeningRange = '30d' | 'all';
export type Listening = {
  range: ListeningRange;
  /** 30 days (`YYYY-MM-DD`) for 30d, months (`YYYY-MM`) for all. */
  days: { day: string; minutes: number }[];
  totalMinutes: number;
  topShows: { feedUrl: string; title: string; minutes: number }[];
  /** Hours stickers → the day they were earned (absent on an older server). */
  earned?: Record<string, string>;
};
/** What a profile read adds for stickers (absent on an older server). */
export type ProfileStickers = { stickers?: Placement[]; stickersHidden?: boolean };

export type ListeningApi = ReturnType<typeof createListeningApi>;

/** Today on this phone as `YYYY-MM-DD` — the server uses it when it is within a day of its own. */
export function localDay(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function createListeningApi(deps: ApiDeps) {
  const call = requester(deps);
  const enc = encodeURIComponent;
  return {
    listening: async (range: ListeningRange, today: string = localDay()) => (await call<Listening>('GET', `/v1/me/listening?range=${range}&today=${enc(today)}`)).json,
    placements: async () => (await call<{ items: Placement[] }>('GET', '/v1/me/stickers/placements')).json.items,
    savePlacements: async (items: readonly Placement[]) => { await call('PUT', '/v1/me/stickers/placements', { items }); },
    /** The recap picture: month, minutes, up to 3 show titles (each cut to 120 characters). */
    recapCardUrl: (month: string, minutes: number, shows: readonly string[]) =>
      `${deps.baseUrl}/v1/share/recap/${enc(month)}.png?m=${Math.min(44_640, Math.max(0, Math.round(minutes)))}${shows.slice(0, 3).map((s) => `&s=${enc(s.slice(0, 120))}`).join('')}`,
    /** The link printed on the recap and sent with it. */
    appLink: () => deps.baseUrl,
  };
}

export function useListeningApi(): ListeningApi {
  return useMemo(() => createListeningApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
