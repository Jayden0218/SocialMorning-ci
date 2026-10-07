// The heat curve as the seek bar: tap or drag across it to jump; the played part is in the accent.
/**
 * M21 US2 (spec story 2, scenario 4): 小宇宙's player has one control here — the reaction curve
 * itself is the seek bar. The separate `Scrubber` under the curve is gone from the player.
 *   - Tap: seek there; `onTap` also gets the heat bucket, so the player opens the moment's
 *     comments when there are some (HeatCurve's behaviour, kept).
 *   - Drag: the played colour follows the finger; the seek happens once, on release.
 *   - Played bars are the accent, the rest the muted bar colour. The listener's own reactions are
 *     a mark under their bar — a shape, never hue alone (FR-016).
 *   - A screen reader meets ONE adjustable element named "Seek", with the value "14:32 of 34:17"
 *     and increment / decrement = +30 s / −15 s, exactly as `Scrubber` (guard G11); the curve's
 *     own sentence ("Most reactions at …") is its hint.
 *
 * Touch is React Native's responder system on our own views (no native slider, no gesture
 * library): it works inside the player's ScrollView because the bar refuses to hand the touch
 * over once it has it.
 */
import { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { usePlayerPalette } from '@/ui/player/palette';
import { heatLabel, heatMessage, type Heat } from '@/ui/player/HeatCurve';
import { scrubberValue } from '@/ui/player/Scrubber';

export const HEAT_BUCKETS = 100;

/** Where along the bar (0..1) a time sits, and back; an unknown length is the start. */
export function fractionAt(ms: number, durationMs: number | undefined): number {
  if (!durationMs) return 0;
  return Math.min(1, Math.max(0, ms / durationMs));
}

/** The heat bucket a time falls in, on the server's axis (`heatAxisMs`). */
export function bucketAt(ms: number, heatAxisMs: number | undefined): number {
  if (!heatAxisMs) return 0;
  return Math.min(HEAT_BUCKETS - 1, Math.max(0, Math.floor((ms * HEAT_BUCKETS) / heatAxisMs)));
}

/** Bar i is played once the position has passed its start (bars sit on the heat axis). */
export function isPlayed(i: number, positionMs: number, heatAxisMs: number | undefined): boolean {
  if (!heatAxisMs) return false;
  return (i / HEAT_BUCKETS) * heatAxisMs < positionMs;
}

export function HeatScrubber(props: {
  heat: Heat | undefined;
  positionMs: number;
  /** The length the player measures — what the bar seeks across. */
  durationMs: number | undefined;
  /** The server's axis for the 100 buckets (may differ from the player's length). */
  heatAxisMs: number | undefined;
  myBuckets?: number[];
  onSeek: (toMs: number) => void;
  /** A tap (not a drag): seek, and the bucket under the finger. */
  onTap?: (bucket: number, toMs: number) => void;
  onSkip: (deltaMs: 30_000 | -15_000) => void;
}): React.ReactElement {
  const c = usePlayerPalette();
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<{ ms: number; moved: boolean } | undefined>();
  const buckets = props.heat?.available ? props.heat.buckets : new Array<number>(HEAT_BUCKETS).fill(0);
  const mine = new Set(props.myBuckets ?? []);
  const message = heatMessage(props.heat);
  // > 1 when the feed declared more than the audio holds: the bars run past the end and are clipped.
  const axisFraction = props.heatAxisMs && props.durationMs ? props.heatAxisMs / props.durationMs : 1;
  const shownMs = drag?.ms ?? props.positionMs;
  const msAt = (e: GestureResponderEvent): number =>
    props.durationMs === undefined || width === 0 ? 0 : Math.round(Math.min(1, Math.max(0, e.nativeEvent.locationX / width)) * props.durationMs);
  const usable = props.durationMs !== undefined && width > 0;

  return (
    <Box className="w-full gap-1">
      <Box
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityHint={heatLabel(props.heat, props.heatAxisMs)}
        accessibilityValue={scrubberValue(props.positionMs, props.durationMs)}
        accessibilityActions={[{ name: 'increment', label: 'Forward 30 seconds' }, { name: 'decrement', label: 'Back 15 seconds' }]}
        onAccessibilityAction={(e) => props.onSkip(e.nativeEvent.actionName === 'increment' ? 30_000 : -15_000)}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => usable}
        onMoveShouldSetResponder={() => usable}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDrag({ ms: msAt(e), moved: false })}
        onResponderMove={(e) => setDrag({ ms: msAt(e), moved: true })}
        onResponderRelease={(e) => {
          const ms = msAt(e);
          const moved = drag?.moved === true;
          setDrag(undefined);
          if (!usable) return;
          if (!moved && props.onTap) props.onTap(bucketAt(ms, props.heatAxisMs), ms);
          else props.onSeek(ms);
        }}
        onResponderTerminate={() => setDrag(undefined)}
        className="w-full overflow-hidden"
        style={{ height: BAR_AREA }}
      >
        <Box pointerEvents="none" className="h-10 flex-row items-end gap-px self-start" style={{ width: `${axisFraction * 100}%` }}>
          {buckets.map((v, i) => (
            // Colours stay tokens in `style`: a bar's height is per bar at runtime.
            <Box key={i} className="flex-1 rounded-t-[1px]" style={{ height: 2 + v * 38, backgroundColor: isPlayed(i, shownMs, props.heatAxisMs) ? c.accent : c.bar }} />
          ))}
        </Box>
        {/* The listener's own reactions: a small mark under their bar. */}
        <Box pointerEvents="none" className="h-1 flex-row gap-px self-start mt-0.5" style={{ width: `${axisFraction * 100}%` }}>
          {buckets.map((_, i) => <Box key={i} className="flex-1 rounded-pill" style={{ backgroundColor: mine.has(i) ? c.text : 'transparent' }} />)}
        </Box>
        {/* The playhead: a thin line where the position (or the finger) is. */}
        <Box pointerEvents="none" className="absolute top-0 bottom-0 w-0.5 bg-text" style={{ left: fractionAt(shownMs, props.durationMs) * width }} />
      </Box>
      {message ? <Text className="text-xs text-muted text-center">{message}</Text> : null}
    </Box>
  );
}

/** The bars (40 pt), the mark row and the gap between them. */
const BAR_AREA = 48;
