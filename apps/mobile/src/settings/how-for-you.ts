/**
 * "How For You works" (M12 FR-094): each answer is what the server's code does
 * (`apps/api/src/db/repos/foryou.ts`, `packages/social-core`), read 2026-09-29 — if that
 * code changes, this text must change with it. The numbers come from the same constants.
 */
import { FATIGUE_LIMIT, LIST_SIZE } from '@socialmorning/social-core';

export type Question = { q: string; a: string };

export const HOW_FOR_YOU: readonly Question[] = [
  {
    q: 'What does For You look at?',
    a: 'Seven sources: new episodes from shows you subscribe to; shows liked by people who like the shows you like; '
      + 'what people you follow listened to in the last 14 days (only listening they left public); new episodes in the two '
      + 'categories you listen to most; the editor\'s pick; what listeners are talking about; and the public chart.',
  },
  {
    q: 'What counts as a show I like?',
    a: 'A show you subscribe to, or a show where you finished at least 3 episodes.',
  },
  {
    q: 'How is the list put in order?',
    a: `Each episode gets one score from how new it is, how well it matches what you like, and how many people talk about it. `
      + `Then the list is spread out: at most one episode per show in the first 10, and ${LIST_SIZE} episodes in all.`,
  },
  {
    q: 'Why does an episode stop appearing?',
    a: `After it has been shown to you ${FATIGUE_LIMIT} times without you opening it, it is not shown again for a while. `
      + 'Shows hidden by moderation, and people you blocked, are never used.',
  },
  {
    q: 'What does For You never use?',
    a: 'Anyone\'s private listening (Settings › Privacy), your location, your contacts, or anything outside SocialNet. '
      + 'Other people only ever count as numbers — For You never tells you who listened.',
  },
  {
    q: 'Can I turn it off?',
    a: 'Yes: Settings › More › Personalised recommendations. When it is off, Discover shows no For You and the phone sends nothing for it.',
  },
];
