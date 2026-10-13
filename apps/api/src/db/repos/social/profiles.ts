// Builds a listener's profile: name, counts, stats and recent public activity.
/** A profile (M4 FR-011/FR-012/FR-013): name, counts, stats (unless private and not the viewer), recent public activity. */
import { stats } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';
import type { FeedItemOut } from './activity.ts';

export type ProfileOut = {
  id: string; displayName: string; followers: number; following: number; isFollowing: boolean;
  stats: ReturnType<typeof stats> | null; recent: FeedItemOut[];
  /** M6: set when the owner suspended this account (FR-015). */
  suspended?: boolean;
  /** M6: set when the VIEWER blocked this listener (so the app can offer Unblock). Never set the other way round (FR-008). */
  blockedByMe?: boolean;
  /** M10b US7: the country from the listener's last sign-in (two letters), shown to everyone. */
  country?: string;
  /** M19 US1: photo and bio, when set. */
  avatarUrl?: string;
  bio?: string;
  /** M21 US9: stickers placed on the header (empty while the owner hides decorations); `stickersHidden` when the owner hides their sticker library from others. */
  stickers?: import('@socialmorning/social-core').Placement[];
  stickersHidden?: true;
  /** M21 US8 (FR-074): shows this listener is a verified host of — the proven claim owner or an invited host. */
  hostOf: { feedUrl: string; title: string }[];
  /** M21 US8: how many episodes they liked — only while their likes are public, or to themselves. */
  likesCount?: number;
  /** M21 US8: their subscriptions page answers 403 `private`; the app shows that state instead of a link. */
  privateSubscriptions: boolean;
  /** M22 US17 item 6: the ≤ 6 shows listened to most in the last 90 days; empty when hidden (or private) and not yourself. */
  oftenListened: OftenListenedShow[];
  /** M22 US17: only on your own profile — whether others see the row (Privacy switch). */
  hideOftenListened?: boolean;
};

export type OftenListenedShow = { feedUrl: string; title: string; imageUrl: string | null; listenedMs: number };

export const OFTEN_LISTENED_DAYS = 90;
export const OFTEN_LISTENED_MAX = 6;

// Bodies in graph-ddb/ (src/db/backend.ts).
export const oftenListened = viaStore<typeof import('./graph-ddb/index.ts').oftenListened>('sg/index', 'oftenListened');
export const setHideOftenListened = viaStore<typeof import('./graph-ddb/index.ts').setHideOftenListened>('sg/index', 'setHideOftenListened');
export const hostOf = viaStore<typeof import('./graph-ddb/index.ts').hostOf>('sg/index', 'hostOf');
export const subscriptionsVisible = viaStore<typeof import('./graph-ddb/index.ts').subscriptionsVisible>('sg/index', 'subscriptionsVisible');
export const profile = viaStore<typeof import('./graph-ddb/index.ts').profile>('sg/index', 'profile');
export const setPrivateListening = viaStore<typeof import('./graph-ddb/index.ts').setPrivateListening>('sg/index', 'setPrivateListening');
