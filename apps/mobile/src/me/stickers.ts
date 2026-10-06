// Works out which listening badges you earned, which comes next, and how each one is earned.
/**
 * Stickers (贴纸, owner 2026-09-27): badges for listening milestones, worked out from the
 * account's own all-time stats and this phone's saved moments. Nothing is stored — a
 * sticker is earned the moment its number is reached, and the list says which is next.
 *
 * M21 US9: the ids and what earns each come from `@socialmorning/social-core` (`STICKER_RULES`),
 * so the server can refuse a placement of a sticker that does not exist. The look (icon, title)
 * and the words on the help page stay here.
 */
import type { IconName } from '@/ui/kit/Icon';
import { plural, STICKER_RULES, type StickerMetric } from '@socialmorning/social-core';

export type StickerInput = { listenedMs: number; finished: number; moments: number; comments: number };
export type Sticker = { id: string; icon: IconName; title: string; earned: boolean; progress: string };

const H = 3_600_000;

/** How each sticker looks, and the one line the help page says about it. */
export const STICKER_LOOK: Record<string, { icon: IconName; title: string; how: string }> = {
  'hour-1': { icon: 'headset-outline', title: 'First hour', how: 'Listen for 1 hour in all.' },
  'hour-10': { icon: 'time-outline', title: '10 hours listened', how: 'Listen for 10 hours in all.' },
  'hour-42': { icon: 'planet-outline', title: '42 hours listened', how: 'Listen for 42 hours in all.' },
  'hour-100': { icon: 'ribbon-outline', title: '100 hours listened', how: 'Listen for 100 hours in all.' },
  'finish-1': { icon: 'flag-outline', title: 'First episode finished', how: 'Play one episode to the end.' },
  'finish-25': { icon: 'trophy-outline', title: '25 episodes finished', how: 'Play 25 episodes to the end.' },
  'moment-1': { icon: 'bookmark-outline', title: 'First saved moment', how: 'Save a moment in the player.' },
  'comment-1': { icon: 'chatbubble-outline', title: 'First comment', how: 'Write your first comment on an episode.' },
};

const UNIT: Record<StickerMetric, string> = { listenedHours: 'h', finished: 'episode', moments: 'moment', comments: 'comment' };
const have = (m: StickerMetric, i: StickerInput): number =>
  m === 'listenedHours' ? i.listenedMs / H : m === 'finished' ? i.finished : m === 'moments' ? i.moments : i.comments;

export function stickers(i: StickerInput): Sticker[] {
  return STICKER_RULES.map((r) => {
    const look = STICKER_LOOK[r.id]!;
    const unit = UNIT[r.metric];
    const n = have(r.metric, i);
    const earned = n >= r.need;
    const shown = unit === 'h' ? Math.floor(n) : n;
    return { id: r.id, icon: look.icon, title: look.title, earned, progress: earned ? 'Earned' : unit === 'h' ? `${shown} of ${r.need} ${unit}` : `${shown} of ${plural(r.need, unit)}` };
  });
}

/** The latest earned sticker, for the profile card's "Latest:" line. */
export function latestEarned(list: readonly Sticker[]): Sticker | undefined {
  return [...list].reverse().find((s) => s.earned);
}

/** M21 US9: the words the share sheet sends for one sticker — its name and when; nobody else. */
export function stickerShareText(s: Pick<Sticker, 'title'>, line: string): string {
  return `I earned the "${s.title}" sticker on SocialNet. ${line}.`;
}

/** "Earned 3 Oct 2026" when the day is known (`YYYY-MM-DD`), otherwise just "Earned". */
export function earnedLine(day: string | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Earned';
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return `Earned ${new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
