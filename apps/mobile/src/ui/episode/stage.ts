// What the Episode page's stage says: the hottest moment, the date pill and the counts line.
/**
 * M31 W3-A (T040, design-pulse2 `episode--screen`): "TUE 27 OCT · 48:10" on the left pill, "hottest at 14:32" on the right
 * one (tap = play from it), and under the curve "120 listened · 14 comments · 2 clips" in mono. All three come from data
 * the phone already has: the feed's date and length, the episode's 100 heat buckets, its comments, its clips and the
 * server's listener count; a part with nothing to say is left out (no "0 listened").
 *
 * The hottest moment is the strongest PEAK `hotMoments` finds (the same rule as the player's pill), cut onto the audio's own
 * axis (`alignHeat`), and the curve lights the run of bars under it (`hotRange`).
 */
import { compactCount, mmss, pluralCompact } from '@/ui/kit/format';
import { alignHeat, hotMoments } from '@/ui/player/hot';
import { episode } from '@/design/tokens';

export type Hottest = { /** The peak, on the audio's axis. */ atMs: number; /** The bars (of `episode.curveBars`) that the moment covers, first and last. */ range: readonly [number, number] };

/** The strongest hot moment of the heat curve, or undefined when no peak stands out. */
export function hottestMoment(buckets: readonly number[] | undefined, heatAxisMs: number | undefined, durationMs: number | undefined, bars: number = episode.curveBars): Hottest | undefined {
  const axis = durationMs ?? heatAxisMs;
  if (!buckets || buckets.length === 0 || !axis || axis <= 0) return undefined;
  const aligned = alignHeat(buckets, heatAxisMs, axis);
  const moments = hotMoments(aligned, axis);
  if (moments.length === 0) return undefined;
  const per = axis / aligned.length;
  let best: { peak: number; value: number; from: number; to: number } | undefined;
  for (const m of moments) {
    const from = Math.max(0, Math.round(m.fromMs / per));
    const to = Math.min(aligned.length - 1, Math.round(m.toMs / per) - 1);
    let peak = from;
    for (let i = from; i <= to; i++) if (aligned[i]! > aligned[peak]!) peak = i;
    if (best === undefined || aligned[peak]! > best.value) best = { peak, value: aligned[peak]!, from, to };
  }
  if (best === undefined) return undefined;
  // Bar k reads bucket floor(k * length / bars) (`spread`), so a bucket b sits under bar floor(b * bars / length).
  const bar = (b: number) => Math.min(bars - 1, Math.floor((b * bars) / aligned.length));
  return { atMs: Math.round(best.peak * per), range: [bar(best.from), bar(best.to)] };
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** "TUE 27 OCT · 48:10" — the feed's date and the length; either part alone when the other is unknown, undefined when both are. */
export function datePill(publishedAt: number | undefined, durationMs: number | undefined): string | undefined {
  const parts: string[] = [];
  if (publishedAt !== undefined) {
    const d = new Date(publishedAt);
    parts.push(`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`);
  }
  if (durationMs !== undefined && durationMs > 0) parts.push(mmss(durationMs));
  return parts.length === 0 ? undefined : parts.join(' · ');
}

/** "120 listened · 14 comments · 2 clips · resumes at 26:37": the parts that exist, in that order. */
export function countsLine(c: { listeners?: number | undefined; comments: number; clips: number }): string {
  const parts: string[] = [];
  if (c.listeners !== undefined && c.listeners > 0) parts.push(`${compactCount(c.listeners)} listened`);
  if (c.comments > 0) parts.push(pluralCompact(c.comments, 'comment'));
  if (c.clips > 0) parts.push(pluralCompact(c.clips, 'clip'));
  return parts.join(' · ');
}
