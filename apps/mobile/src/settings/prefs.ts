// Lists the settings switches, their defaults, and reads them.
/**
 * The switches on the settings pages (M10, owner 2026-09-27), in the settings table on
 * this phone. Each one is read where it acts — a switch nothing reads is not a setting —
 * and each key's reader is named here.
 */
import type { SettingsStore } from '@/storage/types';

export const PREFS = {
  /** For You on Discover, and the recommendation events it sends. Read by `recs/useForYou.ts`. */
  personalRecs: { key: 'pref.personalRecs', default: true },
  /** Download an episode as soon as it is queued. Read by `settings/queue.ts`. */
  autoDownloadQueued: { key: 'pref.autoDownloadQueued', default: false },
  /** One-tap "Queue" adds to the end (on) or plays next (off). Read by `settings/queue.ts`. */
  queueAddToEnd: { key: 'pref.queueAddToEnd', default: true },
  /** Minor mode: episodes marked explicit are hidden. Read by `me/updates.ts`, the show page and the inbox. */
  hideExplicit: { key: 'pref.hideExplicit', default: false },
  /** Popular-content notifications: the day's pick, at most once a day. Synced by `app/settings/push.tsx`. */
  popularPush: { key: 'pref.popularPush', default: true },
  /** M10b US3: a notification when a show you follow publishes. Synced by `app/settings/push.tsx`. */
  newEpisodePush: { key: 'pref.newEpisodePush', default: true },
  /** M10b US4: stream over mobile data (downloaded episodes always play). Read by `settings/playback.ts`. */
  mobilePlayback: { key: 'pref.mobilePlayback', default: true },
  /** M10b US4: the transcript entry on the player. Read by `app/player.tsx`. */
  transcriptEntry: { key: 'pref.transcriptEntry', default: true },
} as const;

export type PrefName = keyof typeof PREFS;

export function getPref(s: Pick<SettingsStore, 'get'>, name: PrefName): boolean {
  const v = s.get(PREFS[name].key);
  return v === undefined ? PREFS[name].default : v === '1';
}

export function setPref(s: SettingsStore, name: PrefName, on: boolean): void {
  s.set(PREFS[name].key, on ? '1' : '0');
}
