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
  /** M19 T070 (research R4): music mode — pitch correction off. Read by `ui/shell/providers.tsx` (at start) and `app/settings/playback.tsx`. */
  musicMode: { key: 'pref.musicMode', default: false },
  /** M19 (2026-10-05, research R3): another app's short sound — off lowers our volume, on pauses. Read by `ui/shell/providers.tsx` (at start) and `app/settings/playback.tsx`. */
  pauseOnPrompts: { key: 'pref.pauseOnPrompts', default: false },
  /** M19 (2026-10-05, research R4): skip silence. Read by `ui/shell/providers.tsx` (at start) and `app/settings/playback.tsx`. */
  skipSilence: { key: 'pref.skipSilence', default: false },
  /** M20 US2 (FR-005): the comment near the listener on the lock screen. Read by `ui/shell/providers.tsx` (the outside bridge, on every check). */
  lockComments: { key: 'pref.lockComments', default: true },
  /** M21 US11 (FR-101): voice boost, off by default. Read by `ui/shell/providers.tsx` (at start) and `ui/settings/AudioRows.tsx`. */
  voiceBoost: { key: 'player.voiceBoost', default: false },
  /** M21 US11 (FR-102): "Play with other apps", off by default. Read by `ui/shell/providers.tsx` (at start) and `ui/settings/AudioRows.tsx`. */
  mixWithOthers: { key: 'player.mixWithOthers', default: false },
  /** M22 US1 (FR-002): a push when someone replies to you (and comments on your like). Synced by `app/settings/push.tsx`. */
  pushReplies: { key: 'push.replies', default: true },
  /** M22 US1: likes on your comments and like-posts, grouped within 10 minutes. Synced by `app/settings/push.tsx`. */
  pushLikes: { key: 'push.likes', default: true },
  /** M22 US1: a new follower. Synced by `app/settings/push.tsx`. */
  pushFollows: { key: 'push.follows', default: true },
  /** M22 US1: someone mentions you. Synced by `app/settings/push.tsx`. */
  pushMentions: { key: 'push.mentions', default: true },
  /** M22 US2/US6: replies and reactions on your status, and new statuses from people you follow. Synced by `app/settings/push.tsx`. */
  pushStatuses: { key: 'push.statuses', default: true },
  /** M22 US15: the PLUS weekly digest. Synced by `app/settings/push.tsx`. */
  pushDigest: { key: 'push.digest', default: true },
} as const;

export type PrefName = keyof typeof PREFS;

export function getPref(s: Pick<SettingsStore, 'get'>, name: PrefName): boolean {
  const v = s.get(PREFS[name].key);
  return v === undefined ? PREFS[name].default : v === '1';
}

export function setPref(s: SettingsStore, name: PrefName, on: boolean): void {
  s.set(PREFS[name].key, on ? '1' : '0');
}
