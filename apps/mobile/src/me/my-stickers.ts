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
