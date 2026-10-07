// The heat curve over a seek bar (track, dark fill, knob): tap or drag across either to jump.
/**
 * M21 US2 (spec story 2, scenario 4): 小宇宙's player has one control here — the reaction curve
 * itself is the seek bar. The separate `Scrubber` under the curve is gone from the player.
 *   - Tap: seek there; `onTap` also gets the heat bucket, so the player opens the moment's
 *     comments when there are some (HeatCurve's behaviour, kept).
 *   - Drag: the fill and the knob follow the finger; the seek happens once, on release.
 *   - M24 US19 (`Player-B`; the iPhone showed no seek bar at all): under the bars a real seek bar —
 *     a 4 pt track, the played part filled dark, a 16 pt knob. The bars are B's light grey (≈ 22 %),
 *     a little darker once played. The listener's own reactions are accent bars AND a mark under
 *     them — a shape, never hue alone (FR-016). The old 2 pt playhead line is gone.
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
import { colour } from '@/design';
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
  const fraction = fractionAt(shownMs, props.durationMs);

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
        className="w-full"
      >
        <Box pointerEvents="none" className="w-full overflow-hidden">
          <Box className="h-10 flex-row items-end gap-px self-start" style={{ width: `${axisFraction * 100}%` }}>
            {buckets.map((v, i) => (
              // Colours stay tokens in `style`: a bar's height is per bar at runtime.
              <Box key={i} className="flex-1 rounded-t-[1px]" style={{ height: 2 + v * 38, backgroundColor: mine.has(i) ? c.accent : c.bar, opacity: barOpacity(mine.has(i), isPlayed(i, shownMs, props.heatAxisMs)) }} />
            ))}
          </Box>
          {/* The listener's own reactions: a small mark under their bar. */}
          <Box className="h-1 flex-row gap-px self-start mt-0.5" style={{ width: `${axisFraction * 100}%` }}>
            {buckets.map((_, i) => <Box key={i} className="flex-1 rounded-pill" style={{ backgroundColor: mine.has(i) ? c.text : 'transparent' }} />)}
          </Box>
        </Box>
        {/* M24 US19: the seek bar — the track, the dark fill to the position (or the finger), the knob. */}
        <Box pointerEvents="none" className="justify-center" style={{ height: TRACK_AREA }}>
          <Box className="h-1 rounded-pill bg-track overflow-hidden">
            <Box className="h-full rounded-pill bg-text" style={{ width: `${fraction * 100}%` }} />
          </Box>
        </Box>
      </Box>
      {message ? <Text className="text-xs text-muted text-center">{message}</Text> : null}
    </Box>
  );
}

/** The seek bar's row: 28 pt tall (B), the 4 pt track centred in it. */
const TRACK_AREA = 28;
/** B's knob: 16 pt. */
export const KNOB = 16;

/** The alpha of an rgba() token (1 for a solid colour). */
export function alphaOf(token: string): number {
  const m = /,\s*([\d.]+)\s*\)\s*$/.exec(token);
  return m ? Number(m[1]) : 1;
}

/** What B draws: unplayed bars at 22 % black, played ones (our addition) at 40 %. */
export const UNPLAYED_ALPHA = 0.22;
const PLAYED_ALPHA = 0.4;

/**
 * A bar's opacity over the `bar` token, so the bar shows at B's strength whatever the token's own
 * alpha is (0.50 today → 0.44 and 0.8). The listener's own reaction is the accent at full strength.
 */
export function barOpacity(mine: boolean, played: boolean, tokenAlpha: number = alphaOf(colour.bar)): number {
  if (mine) return 1;
  return Math.min(1, (played ? PLAYED_ALPHA : UNPLAYED_ALPHA) / tokenAlpha);
}

/** The knob's left edge: centred on the position, never past either end of the track. */
export function knobLeft(fraction: number, width: number): number {
  return Math.min(Math.max(0, width - KNOB), Math.max(0, fraction * width - KNOB / 2));
}
