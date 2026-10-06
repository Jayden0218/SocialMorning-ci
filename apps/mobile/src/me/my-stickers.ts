// Gives the profile card and Stickers page the same listening totals, earned dates and others' stickers.
/**
 * M16a bug 3 (FR-005): the profile card and the Stickers page read ONE source.
 *
 * Phone walk 2026-10-02: the profile card showed 4 stickers earned and 13 h listened; the
 * Stickers page said "1 of 8 earned" and "First hour 0 of 1 h". Cause, read from the code: the
 * profile counted listening as the larger of the server's total and this phone's own
 * (`localTotals`, M12 FR-006 — the server only knows what reached it), while the Stickers page
 * used the server's total alone and started from 0 until its request came back. Both now call
 * `myTotals` / `myStickers` below, and the Stickers page starts from this phone's totals.
 */
import type { Stores } from '@/storage/types';
import type { Profile } from '@/social/api';
import { localTotals } from './history';
import { listMoments } from './moments';
import { stickers, type Sticker } from './stickers';

export type Totals = { listenedMs: number; finished: number };

/** Your listening: the larger of the server's all-time total and this phone's. */
export function myTotals(stores: Pick<Stores, 'positions' | 'feeds'>, server: Totals | undefined): Totals {
  const local = localTotals(stores);
  if (!server) return local;
  return { listenedMs: Math.max(server.listenedMs, local.listenedMs), finished: Math.max(server.finished, local.finished) };
}

/** Your stickers, from `myTotals`, this phone's saved moments and the profile's comments. */
export function myStickers(stores: Pick<Stores, 'positions' | 'feeds' | 'settings'>, profile: Pick<Profile, 'stats' | 'recent'> | undefined): Sticker[] {
  const t = myTotals(stores, profile?.stats?.all);
  return stickers({
    listenedMs: t.listenedMs,
    finished: t.finished,
    moments: listMoments(stores.settings).length,
    comments: profile ? profile.recent.filter((r) => r.kind === 'commented').length : 0,
  });
}

/**
 * M21 US9: the day each of your stickers was earned, where it can be known — the hours stickers
 * from the server's own listened days (`GET /v1/me/listening` `earned`), "First saved moment" from
 * the oldest moment still on this phone. Others (finished episodes, first comment) are not dated:
 * the page then says just "Earned".
 */
export function earnedDays(server: Record<string, string> | undefined, settings: Stores['settings']): Record<string, string> {
  const out: Record<string, string> = { ...(server ?? {}) };
  const moments = listMoments(settings);
  if (moments.length > 0) {
    const first = new Date(Math.min(...moments.map((m) => m.savedAt)));
    out['moment-1'] = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
  }
  return out;
}

/**
 * M21 US9: someone else's earned stickers on their profile — from what their profile shows
 * (all-time listening, finished episodes, their public comments). Their saved moments live on
 * their phone, so "First saved moment" never shows for others. None while their listening is private.
 */
export function theirStickers(profile: Pick<Profile, 'stats' | 'recent'>): Sticker[] {
  if (!profile.stats) return [];
  return stickers({
    listenedMs: profile.stats.all.listenedMs,
    finished: profile.stats.all.finished,
    moments: 0,
    comments: profile.recent.filter((r) => r.kind === 'commented').length,
  }).filter((s) => s.earned);
}
