// The whole-episode curve at the top of the comments page, with the playhead, and who is listening now at its right end.
/**
 * M31 W2-B (`social.html` `commentsBase`: `bars(80, 26, { played, min: 2, gap: 1 })` with a 2 px position line;
 * `index.html#comments--screen`: "tap to jump the thread", "the avatars of people listening now sit at the right end of the
 * map row"). 80 bars 26 tall, hot to violet where played; the line is the played share of the width. A touch or drag along
 * it asks the page for that fraction of the episode (the page scrolls the thread to the nearest moment). Listening now:
 * when the server counts 2 or more, up to three overlapping 20 discs and the count at the end of the row (the server sends a
 * count, not names, so the discs are anonymous and the count is the number).
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Curve } from '@/ui/kit/Curve';
import { Type } from '@/ui/kit/Type';
import { compactCount } from '@/ui/kit/format';
import { colour } from '@/design';
import { COMMENTS } from './measures';

const NONE: readonly number[] = [];
const DISC = ['bg-hot', 'bg-violet', 'bg-pinGreen'] as const;

/** How many discs a count draws: one per listener up to three. */
export function liveDiscs(count: number | undefined): number {
  return count !== undefined && count >= 2 ? Math.min(COMMENTS.liveMax, count) : 0;
}

export function CommentsMap(props: {
  heat: readonly number[] | undefined;
  /** Played share of the episode, 0–1 (the player's, or where the phone last left it). */
  played: number;
  onJump: (fraction: number) => void;
  /** The number of listeners now, when the server counts 2 or more. */
  listening?: number | undefined;
}): React.ReactElement {
  const [width, setWidth] = useState(0);
  const discs = liveDiscs(props.listening);
  const x = Math.round(Math.min(1, Math.max(0, props.played)) * width);
  return (
    <Box className="flex-row items-center" style={{ gap: COMMENTS.liveGap }}>
      <Box className="flex-1" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="comments-map">
        <Curve
          data={props.heat ?? NONE}
          count={COMMENTS.mapBars}
          height={COMMENTS.mapHeight}
          min={COMMENTS.mapMin}
          gap={COMMENTS.mapGapBars}
          played={props.played}
          onSeek={props.onJump}
          accessibilityLabel="Where people reacted. Touch to jump the comments to that moment"
        />
        <Box className="absolute top-0 bg-text" pointerEvents="none" style={{ left: x, width: COMMENTS.line, height: COMMENTS.mapHeight }} testID="comments-map-line" />
      </Box>
      {discs > 0 ? (
        <Box className="flex-row items-center" accessible accessibilityLabel={`${compactCount(props.listening ?? 0)} listening now`} testID="listening-now">
          {Array.from({ length: discs }, (_, k) => (
            <Box key={k} className={`rounded-pill ${DISC[k] ?? 'bg-hot'}`} style={{ width: COMMENTS.liveDisc, height: COMMENTS.liveDisc, marginLeft: k === 0 ? 0 : -COMMENTS.liveOverlap, borderWidth: 2, borderColor: colour.void }} />
          ))}
          <Type step="mono" className="text-text2" style={{ marginLeft: 6 }}>{compactCount(props.listening ?? 0)}</Type>
        </Box>
      ) : null}
    </Box>
  );
}
