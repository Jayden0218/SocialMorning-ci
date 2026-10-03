/**
 * Stickers (贴纸, owner 2026-09-27): badges for listening milestones, worked out from the
 * account's own all-time stats and this phone's saved moments. Nothing is stored — a
 * sticker is earned the moment its number is reached, and the list says which is next.
 */
import type { IconName } from '@/ui/kit/Icon';
import { plural } from '@socialmorning/social-core';

export type StickerInput = { listenedMs: number; finished: number; moments: number; comments: number };
export type Sticker = { id: string; icon: IconName; title: string; earned: boolean; progress: string };

const H = 3_600_000;
const RULES: { id: string; icon: IconName; title: string; need: number; have: (i: StickerInput) => number; unit: string }[] = [
  { id: 'hour-1', icon: 'headset-outline', title: 'First hour', need: 1, have: (i) => i.listenedMs / H, unit: 'h' },
  { id: 'hour-10', icon: 'time-outline', title: '10 hours listened', need: 10, have: (i) => i.listenedMs / H, unit: 'h' },
  { id: 'hour-42', icon: 'planet-outline', title: '42 hours listened', need: 42, have: (i) => i.listenedMs / H, unit: 'h' },
  { id: 'hour-100', icon: 'ribbon-outline', title: '100 hours listened', need: 100, have: (i) => i.listenedMs / H, unit: 'h' },
  { id: 'finish-1', icon: 'flag-outline', title: 'First episode finished', need: 1, have: (i) => i.finished, unit: 'episode' },
  { id: 'finish-25', icon: 'trophy-outline', title: '25 episodes finished', need: 25, have: (i) => i.finished, unit: 'episode' },
  { id: 'moment-1', icon: 'bookmark-outline', title: 'First saved moment', need: 1, have: (i) => i.moments, unit: 'moment' },
  { id: 'comment-1', icon: 'chatbubble-outline', title: 'First comment', need: 1, have: (i) => i.comments, unit: 'comment' },
];

export function stickers(i: StickerInput): Sticker[] {
  return RULES.map((r) => {
    const have = r.have(i);
    const earned = have >= r.need;
    const shown = r.unit === 'h' ? Math.floor(have) : have;
    return { id: r.id, icon: r.icon, title: r.title, earned, progress: earned ? 'Earned' : r.unit === 'h' ? `${shown} of ${r.need} ${r.unit}` : `${shown} of ${plural(r.need, r.unit)}` };
  });
}

/** The latest earned sticker, for the profile card's "Latest:" line. */
export function latestEarned(list: readonly Sticker[]): Sticker | undefined {
  return [...list].reverse().find((s) => s.earned);
}
