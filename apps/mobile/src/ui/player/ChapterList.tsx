// List of episode chapters in a raised card; the current one is lit with a live mini curve; tap to jump there.
/**
 * Chapters (US5, FR-021): start time + title, the current one highlighted, tap → seek.
 *
 * M31 T024 (design-pulse2 `player--screen`, the More sheet's chapter list): a raise card (radius 20,
 * 10 / 12 of padding); each row is a timestamp chip (solid hot for the current chapter, soft for the
 * rest), the title (Geist 500 14; 700 when current), and — on the current one only — a six-bar mini
 * curve that fills as the chapter plays; "↗" opens the chapter's link. The current row sits on raise2
 * with radius 12. Round 2: the card is radius 20 and the rows the drawn 36 tall, 2 apart, 10 between the parts (they had been
 * 48 tall, 4 apart, 12 between; the 48 tap area is now `hitSlop`). The rows keep their names ("Chapter 3, The coffee question").
 */
import { currentChapter, type Chapter } from '@socialmorning/player-core';
import { useOpenLink } from '@/ui/kit/useOpenLink';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Curve } from '@/ui/kit/Curve';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Text } from '@/ui/kit/Text';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';

/** The drawing's chapter chips are two-digit minutes ("04:12", "00:00"); everywhere else a time reads "4:12". */
export function chapterStamp(ms: number): string {
  const t = mmss(ms);
  return /^\d:\d\d$/.test(t) ? `0${t}` : t;
}
import { PLAYER } from './measures';

/** A drawn row is 36 tall; the finger gets 48. */
const ROW_SLOP = { top: 6, bottom: 6, left: 0, right: 0 };

const MINI = [0.4, 0.8, 0.6, 1, 0.7, 0.5];

/** How far through chapter `i` the position is (0–1), for the mini curve. */
export function chapterProgress(chapters: readonly Chapter[], i: number, positionMs: number, durationMs?: number): number {
  const from = chapters[i]!.startMs;
  const to = chapters[i]!.endMs ?? chapters[i + 1]?.startMs ?? durationMs;
  if (to === undefined || to <= from) return 0;
  return Math.min(1, Math.max(0, (positionMs - from) / (to - from)));
}

export function ChapterList(props: { chapters: Chapter[]; positionMs: number; onSeek: (ms: number) => void; durationMs?: number }): React.ReactElement {
  const current = currentChapter(props.chapters, props.positionMs);
  const { open: openLink } = useOpenLink();
  return (
    <Box testID="chapter-list" className="w-full bg-raise" style={{ borderRadius: PLAYER.panelRadius, gap: PLAYER.chapterRowGap, paddingVertical: PLAYER.chapterPadY, paddingHorizontal: PLAYER.chapterPadX }}>
      {props.chapters.map((c, i) => (
        <Pressable key={`${c.startMs}-${i}`} onPress={() => props.onSeek(c.startMs)} accessibilityRole="button" accessibilityLabel={`Chapter ${i + 1}, ${c.title ?? mmss(c.startMs)}`} accessibilityState={{ selected: i === current }} hitSlop={ROW_SLOP} className={`flex-row items-center rounded-small ${i === current ? 'bg-raise2' : ''}`} style={{ gap: PLAYER.chapterGap, paddingVertical: PLAYER.chapterRowPadY, paddingHorizontal: PLAYER.chapterRowPadX, minHeight: PLAYER.chapterRow }}>
          <TimestampChip text={chapterStamp(c.startMs)} solid={i === current} />
          <Type step="note" className={`flex-1 text-text ${i === current ? 'font-bold' : ''}`} numberOfLines={2}>{c.title ?? `Chapter ${i + 1}`}</Type>
          {i === current ? <Box style={{ width: PLAYER.chapterMini }}><Curve data={MINI} count={6} height={PLAYER.chapterBars} min={PLAYER.chapterBarsMin} gap={PLAYER.chapterBarsGap} played={chapterProgress(props.chapters, i, props.positionMs, props.durationMs)} /></Box> : null}
          {c.url ? (
            <Pressable onPress={() => void openLink(c.url!)} accessibilityRole="link" hitSlop={8}><Text className="text-hotText text-pulse-compact font-semibold">↗</Text></Pressable>
          ) : null}
        </Pressable>
      ))}
    </Box>
  );
}
