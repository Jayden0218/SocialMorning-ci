// Sends new-episode push notifications through Expo, never twice to one device.
/**
 * M10b US3 — notifications that are actually sent (research R4).
 *
 * The hourly rebuild's `feeds` step already re-reads every followed feed. An episode it
 * registers for the first time, published in the last 48 h, is "new": each follower with
 * "New episodes" on gets one notification per show per cycle (the newest), through Expo's
 * free push service. `push_sent`'s primary key is the "never twice" rule (guard G-N1): a
 * device is told about an episode once, whatever reruns or retries happen.
 */
import { type PushKind } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

export const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
export const NEW_WINDOW_HOURS = 48;

export type PushMessage = {
  to: string; title: string; body: string; data: Record<string, string>; sound: 'default';
  /** M22: Android channel and the key that makes a later push replace an earlier one. */
  channelId?: string; tag?: string; threadId?: string;
};

export const saveToken = viaStore<typeof import('./ddb/index.ts').saveToken>('ac/index', 'saveToken');

export const deleteToken = viaStore<typeof import('./ddb/index.ts').deleteToken>('ac/index', 'deleteToken');

export type PrefsPatch = {
  newEpisodes?: boolean; popular?: boolean;
  replies?: boolean; likes?: boolean; follows?: boolean; mentions?: boolean; statuses?: boolean; digest?: boolean;
  /** M24 fix F-S: system notices from SocialNet. */
  system?: boolean;
};

/** Saves only the switches sent; the rest keep their value (all default on). */
export const setPrefs = viaStore<typeof import('./ddb/index.ts').setPrefs>('ac/index', 'setPrefs');

export const getPrefs = viaStore<typeof import('./ddb/index.ts').getPrefs>('ac/index', 'getPrefs');

/**
 * Sends through Expo in batches of 100. A `DeviceNotRegistered` answer deletes that token
 * (the app was uninstalled); any other error leaves it for the next cycle.
 */
export const sendExpo = viaStore<typeof import('./ddb/index.ts').sendExpo>('ac/index', 'sendExpo');

/**
 * One new episode of one show → every follower's devices, once. The `push_sent` insert
 * happens before sending and only for listeners not already told (G-N1).
 */
export const fanOutNewEpisode = viaStore<typeof import('./ddb/index.ts').fanOutNewEpisode>('ac/index', 'fanOutNewEpisode');

/** The day's pick → listeners with "Popular content" on, at most once a day each. */
export const sendPopular = viaStore<typeof import('./ddb/index.ts').sendPopular>('ac/index', 'sendPopular');

// ---- M22 US1/US3/US6: pushes for interactions (specs/023 research R2) ----

/** The fetch social pushes use. `createApp` sets it from `deps.pushFetch` so tests can fake Expo. */
let socialFetch: typeof fetch = (...a) => fetch(...a);
export function setSocialPushFetch(f: typeof fetch): void { socialFetch = f; }
/** M26: the same fetch, for the DynamoDB twin (ddb/push.ts). */
export const socialPushFetch = (): typeof fetch => socialFetch;

export type SocialNotice = { recipientId: string; actorId: string; kind: PushKind; ref: Record<string, string> };

/** The in-app place a push opens (contracts/api.md "Push"). */
export function hrefFor(n: SocialNotice): string {
  const r = n.ref;
  switch (n.kind) {
    case 'reply': case 'mention': case 'like':
      return `/comments/thread/${r['parentId'] ?? r['commentId']}`;
    case 'follow': return `/profile/${n.actorId}`;
    case 'like_post_comment': case 'like_post_like': return `/like/${r['ownerId']}/${r['episodeId']}`;
    default: return `/status/${r['postId']}`;
  }
}

/** The thread a notice belongs to, for "Mute this" (US3) and for grouping likes. */
export function threadOf(n: SocialNotice): { kind: 'comment' | 'like_post'; key: string } | null {
  const r = n.ref;
  if (n.kind === 'like_post_comment' || n.kind === 'like_post_like') return { kind: 'like_post', key: `${r['ownerId']}:${r['episodeId']}` };
  if (n.kind === 'reply' || n.kind === 'mention') return { kind: 'comment', key: r['parentId'] ?? r['commentId']! };
  if (n.kind === 'like') return { kind: 'comment', key: r['commentId']! };
  return null;
}

export function words(kind: PushKind, name: string, count: number, excerpt: string | null): { title: string; body: string } {
  const who = count > 1 ? `${name} and ${count - 1} other${count - 1 === 1 ? '' : 's'}` : name;
  switch (kind) {
    case 'reply': return { title: `${name} replied`, body: excerpt ?? 'to your comment' };
    case 'mention': return { title: `${name} mentioned you`, body: excerpt ?? '' };
    case 'like': return { title: `${who} liked your comment`, body: excerpt ?? '' };
    case 'follow': return { title: `${name} followed you`, body: 'Tap to see their profile' };
    case 'like_post_comment': return { title: `${name} commented on your like`, body: excerpt ?? '' };
    case 'like_post_like': return { title: `${who} reacted to your like`, body: '' };
    case 'status_reply': return { title: `${name} replied to your status`, body: excerpt ?? '' };
    case 'status_reaction': return { title: `${who} reacted to your status`, body: '' };
    case 'status_milestone': return { title: 'Your status got 100 reactions', body: 'Tap to see who' };
    // Fix F-S: system notices push through pushNotice (system-notices.ts) with their own words.
    case 'system': return { title: 'SocialNet', body: excerpt ?? '' };
  }
}

/**
 * One notice → at most one push to each of the recipient's devices. Never throws: a push that
 * fails must not undo the act it reports. Returns how many devices were told.
 */
export const pushFor = viaStore<typeof import('./ddb/index.ts').pushFor>('ac/index', 'pushFor');

// ---- M22 US6 (FR-022): a push to followers when someone posts a status ----

/** A poster's statuses push at most this many times a day (Kuala Lumpur day). */
export const STATUS_PUSHES_PER_DAY = 5;

/**
 * One new status → each follower with "Statuses" on gets one push, unless the follower and the
 * poster blocked each other (either way) or the follower muted them. `status_push_log` counts the
 * poster's pushing statuses per day; the 6th and later post normally but push no one. Never
 * throws (like `pushFor`).
 */
export const pushNewStatus = viaStore<typeof import('./ddb/index.ts').pushNewStatus>('ac/index', 'pushNewStatus');
