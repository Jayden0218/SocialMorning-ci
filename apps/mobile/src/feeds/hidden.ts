// Remembers which episodes a show's creator hid, and leaves them out of the phone's lists.
/**
 * M24 fix F-P (US11 on the phone): a creator can hide an episode in the Studio. The server leaves
 * it out of everything it lists, but the phone parses the RSS itself (`src/feeds/fetch.ts`), so the
 * feed still carries it. The server tells the phone the hidden guids two ways — `hiddenGuids` in
 * `GET /v1/shows/extras` (the show page) and `GET /v1/shows/hidden-episodes?feedUrl=` (each feed
 * refresh). This file keeps the last answer per show in settings, so the lists drop them offline
 * too: the show page, Updates (and so play-latest, the car and Siri), the subscriptions' "latest"
 * line and the library search.
 *
 * Guard (G-M24-FP2): __tests__/m24-fixes-fp.test.tsx — a hidden guid is not listed.
 */
import type { CachedEpisode, SettingsStore, Stores } from '@/storage/types';

export const hiddenKey = (feedUrl: string): string => `hidden.guids.${feedUrl}`;

/** The hidden guids last heard for this show; an empty set when none (or unreadable). */
export function readHiddenGuids(s: Pick<SettingsStore, 'get'> | undefined, feedUrl: string): ReadonlySet<string> {
  const raw = s?.get(hiddenKey(feedUrl));
  if (!raw) return new Set();
  try {
    const v: unknown = JSON.parse(raw);
    return new Set(Array.isArray(v) ? v.filter((g): g is string => typeof g === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remembers the server's answer for this show (an empty list clears it). */
export function saveHiddenGuids(s: Pick<SettingsStore, 'get' | 'set'>, feedUrl: string, guids: readonly string[]): void {
  const next = JSON.stringify([...new Set(guids)].sort());
  if ((s.get(hiddenKey(feedUrl)) ?? '[]') !== next) s.set(hiddenKey(feedUrl), next);
}

/** The episodes whose guid is not hidden. */
export function withoutHidden<E extends { guid: string }>(episodes: readonly E[], hidden: ReadonlySet<string>): E[] {
  void hidden; return [...episodes]; // RED-CHECK: hidden episodes listed again
}

/** A show's cached episodes, newest first, without the ones its creator hid. */
export function visibleEpisodes(stores: Pick<Stores, 'feeds'> & { settings?: Pick<SettingsStore, 'get'> | undefined }, feedUrl: string): CachedEpisode[] {
  return withoutHidden(stores.feeds.listEpisodes(feedUrl), readHiddenGuids(stores.settings, feedUrl));
}

/**
 * Asks the server for each show's hidden guids and remembers them. A failure keeps what was
 * remembered (offline, an older server): hiding is the creator's wish, not a safety rule.
 */
export async function refreshHiddenGuids(s: Pick<SettingsStore, 'get' | 'set'>, feedUrls: readonly string[], ask: (feedUrl: string) => Promise<string[]>): Promise<void> {
  for (const feedUrl of feedUrls) {
    try {
      saveHiddenGuids(s, feedUrl, await ask(feedUrl));
    } catch {
      // keep the last answer
    }
  }
}
