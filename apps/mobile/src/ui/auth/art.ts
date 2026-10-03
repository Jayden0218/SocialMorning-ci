/**
 * The artwork on the sign-in landing page (owner's reference, 2026-09-27): real show
 * covers, never a stock picture. The listener's own shows first, then what Discover last
 * cached. Nothing invented — with neither, the wall is simply empty.
 */
import type { Discover } from '@/social/api';

export const ART_MAX = 7;

export function landingArt(src: { subscribed: (string | undefined)[]; discover?: Discover }, max = ART_MAX): string[] {
  const d = src.discover;
  const all = [
    ...src.subscribed,
    ...(d?.picks ?? []).map((i) => i.episode.imageUrl),
    ...(d?.shows ?? []).map((s) => s.imageUrl),
    ...(d?.talkedAbout ?? []).map((i) => i.episode.imageUrl),
    ...(d?.trending ?? []).map((i) => i.episode.imageUrl),
  ];
  const out: string[] = [];
  for (const u of all) {
    if (u && !out.includes(u)) out.push(u);
    if (out.length === max) break;
  }
  return out;
}
