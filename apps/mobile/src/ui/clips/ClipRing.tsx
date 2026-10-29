// The clip page's ring: a 200 arc that fills as the clip plays, with the play/pause button in the middle.
/**
 * M31 W3-B (T041; design-pulse2 `clip--screen`, `arcBox(200, .62, …, { w: 8, track: 'rgba(255,255,255,.18)' })`): the
 * track is white at 18 % (`glassEdge`, 15 %, is the nearest token — decoration, the words beside it carry the time),
 * the played arc runs hot to violet with round caps from 12 o'clock, 8 thick; in the middle a 110 light disc with a void
 * play or pause glyph (40). It follows the clock itself, so the page does not re-render on every tick (guard G-PERF
 * in perf-port.test.tsx). The disc is the page's "Play the clip" button.
 */
import { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { colour } from '@/design';
import { sameClock, selectClock, usePlayerSelector } from '@/playback/store';
import { Icon } from '@/ui/kit/Icon';
import { CLIP_RING } from './measures';

/** How much of the clip has played, 0–1 (0 until the clock is inside the range). */
export function clipFraction(positionMs: number, startMs: number, endMs: number): number {
  if (!(endMs > startMs)) return 0;
  return Math.min(1, Math.max(0, (positionMs - startMs) / (endMs - startMs)));
}

function Arc(props: { fraction: number }): React.ReactElement {
  const { size, stroke } = CLIP_RING;
  const id = `cr${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colour.hot} />
          <Stop offset="1" stopColor={colour.violet} />
        </LinearGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour.glassEdge} strokeWidth={stroke} />
      {props.fraction > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * props.fraction).toFixed(1)} ${c.toFixed(1)}`} /> : null}
    </Svg>
  );
}

/** The arc alone, following the clock while this clip plays. */
function LiveArc(props: { startMs: number; endMs: number; live: boolean }): React.ReactElement {
  const clock = usePlayerSelector(selectClock, sameClock);
  return <Arc fraction={props.live ? clipFraction(clock.positionMs, props.startMs, props.endMs) : 0} />;
}

export function ClipRing(props: {
  startMs: number;
  endMs: number;
  /** The clip is the thing playing (so the arc follows the clock). */
  live: boolean;
  playing: boolean;
  label: string;
  onPress: () => void;
}): React.ReactElement {
  const { size, disc, glyph } = CLIP_RING;
  return (
    <Box testID="clip-ring" className="items-center justify-center" style={{ width: size, height: size }}>
      <LiveArc startMs={props.startMs} endMs={props.endMs} live={props.live} />
      <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} className="items-center justify-center bg-text rounded-pill" style={{ width: disc, height: disc }}>
        <Icon name={props.playing ? 'pause' : 'play'} size={glyph} color={colour.void} />
      </Pressable>
    </Box>
  );
}
