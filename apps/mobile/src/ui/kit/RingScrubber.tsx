// The ring scrubber: the reaction curve wrapped round a circle — 100 spokes, a knob, avatar pins; drag to seek.
/**
 * M31 T022 (design-pulse2 `kit.js` `PK.ring`; listen.html `player--screen`, "Layout: Ring"): the
 * Pulse player's scrubber. The 100 heat buckets are 100 spokes starting at 12 o'clock and running
 * clockwise, each as long as its bucket is hot (`4 + maxL * v`). Played spokes run hot to violet
 * (graded across the played part), the rest are `barIdle`. The cover sits in the middle (the
 * caller's `children`, `inner` × the ring), a knob (16, text colour, a 4 pt halo) marks the
 * position, and 18 pt avatar pins sit on the rim at today's comment moments.
 *
 *   - Drag the ring, or tap a spoke, to seek: `onSeek(fraction)` while moving, `onSeekEnd` on release.
 *   - For a screen reader the ring is one adjustable control ("Seek"): swipe up/down = `onStep(±1)`
 *     (the caller moves ±15 s, `STEP_MS`).
 *   - The spokes are redrawn when the whole number of played spokes changes (100 times an episode),
 *     not on every tick; only the knob follows the position.
 * Drawn with react-native-svg lines; the cover and pins are views.
 */
import { memo, useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { colour, glow } from '@/design';
import { BUCKETS, fractionAt, playedColour, pointOn, spokes as layoutSpokes } from './pulse-math';
import { useColours } from './useColours';

export type RingPin = { at: number; colour?: string; label?: string; onPress?: () => void };

const KNOB = 16;
const HALO = 4;
const PIN = 18;
const PIN_BORDER = 2;

const Spokes = memo(function Spokes(props: { size: number; inner: number; heat: readonly number[]; done: number; hot: string }): React.ReactElement {
  const { spokes } = useMemo(() => layoutSpokes(props.size, props.inner, props.heat), [props.size, props.inner, props.heat]);
  return (
    <Svg width={props.size} height={props.size} viewBox={`0 0 ${props.size} ${props.size}`} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
      {spokes.map((s) => (
        <Line
          key={s.index}
          x1={s.x1.toFixed(1)}
          y1={s.y1.toFixed(1)}
          x2={s.x2.toFixed(1)}
          y2={s.y2.toFixed(1)}
          stroke={s.index < props.done ? playedColour(s.index, props.done, props.hot) : colour.barIdle}
          strokeWidth={(props.size / 130).toFixed(1)}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
});

export function Ring(props: {
  heat: readonly number[];
  /** Played, 0–1. */
  progress: number;
  size?: number;
  /** The cover's share of the ring's width. */
  inner?: number;
  pins?: readonly RingPin[];
  knob?: boolean;
  onSeek?: (fraction: number) => void;
  onSeekEnd?: (fraction: number) => void;
  /** Screen-reader step: -1 / +1 (the caller moves ±15 s). */
  onStep?: (direction: -1 | 1) => void;
  /** Spoken name of the control, e.g. "Seek". */
  label?: string;
  /** Spoken value, e.g. "12:32 of 48:10". */
  valueText?: string;
  /** The cover's glow colour (the player's drawing uses #FF6B8B; the default is the hot glow). */
  glowColour?: string;
  /** The cover (or the splash icon): drawn in the middle, `inner` × size wide, round. */
  children?: React.ReactNode;
}): React.ReactElement {
  const size = props.size ?? 330;
  const inner = props.inner ?? 0.62;
  const c = useColours();
  const progress = Math.min(1, Math.max(0, Number.isFinite(props.progress) ? props.progress : 0));
  const done = Math.round(progress * BUCKETS);
  const { r0 } = useMemo(() => layoutSpokes(size, inner, props.heat), [size, inner, props.heat]);
  const live = useRef({ onSeek: props.onSeek, onSeekEnd: props.onSeekEnd, size });
  live.current = { onSeek: props.onSeek, onSeekEnd: props.onSeekEnd, size };
  const pan = useMemo(() => {
    const at = (e: { nativeEvent: { locationX: number; locationY: number } }) => fractionAt(e.nativeEvent.locationX, e.nativeEvent.locationY, live.current.size / 2, live.current.size / 2);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => live.current.onSeek !== undefined,
      onMoveShouldSetPanResponder: () => live.current.onSeek !== undefined,
      onPanResponderGrant: (e) => live.current.onSeek?.(at(e)),
      onPanResponderMove: (e) => live.current.onSeek?.(at(e)),
      onPanResponderRelease: (e) => live.current.onSeekEnd?.(at(e)),
      onPanResponderTerminate: (e) => live.current.onSeekEnd?.(at(e)),
    });
  }, []);
  const knobAt = pointOn(size, r0 - 2, progress);
  const d = size * inner;
  const interactive = props.onSeek !== undefined;
  return (
    <Box
      testID="ring"
      style={{ width: size, height: size }}
      {...(interactive ? pan.panHandlers : {})}
      accessible={interactive}
      accessibilityRole={interactive ? 'adjustable' : undefined}
      accessibilityLabel={props.label ?? 'Seek'}
      accessibilityValue={props.valueText !== undefined ? { text: props.valueText } : undefined}
      accessibilityActions={interactive ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') props.onStep?.(1);
        if (e.nativeEvent.actionName === 'decrement') props.onStep?.(-1);
      }}
    >
      <Spokes size={size} inner={inner} heat={props.heat} done={done} hot={c.hot} />
      <Box
        className="absolute rounded-pill items-center justify-center overflow-hidden"
        style={{ left: (size - d) / 2, top: (size - d) / 2, width: d, height: d, shadowColor: props.glowColour ?? glow.cover.color, shadowOpacity: glow.cover.opacity, shadowRadius: glow.cover.radius, shadowOffset: { width: 0, height: 0 } }}
      >
        {props.children}
      </Box>
      {props.knob === false ? null : (
        // A 16 knob in a 4 pt halo (box-shadow 0 0 0 4 in the drawing): the halo is the outer disc.
        <Box
          testID="ring-knob"
          pointerEvents="none"
          className="absolute rounded-pill items-center justify-center bg-grab"
          style={{ left: knobAt.x - KNOB / 2 - HALO, top: knobAt.y - KNOB / 2 - HALO, width: KNOB + HALO * 2, height: KNOB + HALO * 2 }}
        >
          <Box className="rounded-pill bg-text" style={{ width: KNOB, height: KNOB }} />
        </Box>
      )}
      {(props.pins ?? []).map((p, k) => {
        const at = pointOn(size, size / 2 - 8, p.at);
        const style = { left: at.x - PIN / 2, top: at.y - PIN / 2, width: PIN, height: PIN, borderWidth: PIN_BORDER, borderColor: colour.void, backgroundColor: p.colour ?? colour.pinGreen };
        const key = `pin-${k}`;
        return p.onPress ? (
          <Pressable key={key} testID="ring-pin" onPress={p.onPress} accessibilityRole="button" accessibilityLabel={p.label ?? 'Comment here'} hitSlop={13} className="absolute rounded-pill" style={style} />
        ) : (
          <Box key={key} testID="ring-pin" pointerEvents="none" className="absolute rounded-pill" style={style} />
        );
      })}
    </Box>
  );
}
