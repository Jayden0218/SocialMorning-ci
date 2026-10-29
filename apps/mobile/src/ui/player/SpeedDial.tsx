// The speed dial: 26 ticks on a 270° arc from 0.5× to 3.0×; drag the knob round in 0.1 steps.
/**
 * M31 T024 (design-pulse2 `player--playback-sheet`, `speedDial(176)`): ticks lit hot → violet up to
 * the rate (whole and half rates are longer and thicker), a 14 knob in a 4 halo, the rate in Unbounded
 * 800 (a fifth of the dial) in the middle over "SPEED" (the drawing's `.cap`), and "0.5" / "3.0" at the bottom corners in the
 * page's 15 pt mono (the drawing sets them in the inherited 15, not the 12 of a timestamp).
 * Drag anywhere on it, or tap a point, to set the rate; to a screen reader it is ONE adjustable
 * "Speed" (value "1.2×", increment/decrement ±0.1) — what the slider was.
 * The change is handed up when the finger lifts or moves a step: `onChange` is the sheet's `set`,
 * which also saves the rate for the show.
 */
import { useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { clampRate, rateAtFraction, RATE_MAX, RATE_MIN, RATE_STEP } from '@socialmorning/player-core';
import { Box } from '@/ui/lib/box';
import { colour, tabular } from '@/design';
import { Type } from '@/ui/kit/Type';
import { playedColour } from '@/ui/kit/pulse-math';
import { useColours } from '@/ui/kit/useColours';
import { Cap } from './Cap';
import { DIAL_TICKS, dialFraction, knobPoint, ticks } from './dial-math';
import { PLAYER } from './measures';

const KNOB = 14;
const HALO = 4;

export function SpeedDial(props: { rate: number; onChange: (rate: number) => void; size?: number }): React.ReactElement {
  const size = props.size ?? 176;
  const c = useColours();
  const [drag, setDrag] = useState<number | undefined>();
  const last = useRef(props.rate);
  const shown = drag ?? props.rate;
  const at = (e: GestureResponderEvent): number => rateAtFraction(dialFraction(e.nativeEvent.locationX, e.nativeEvent.locationY, size));
  const move = (e: GestureResponderEvent) => {
    const r = at(e);
    setDrag(r);
    // Each new step is applied as the finger passes it, so the sound follows the dial.
    if (r !== last.current) { last.current = r; props.onChange(r); }
  };
  const knob = knobPoint(size, shown);
  return (
    <Box
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Speed"
      accessibilityValue={{ min: RATE_MIN * 10, max: RATE_MAX * 10, now: Math.round(shown * 10), text: `${shown.toFixed(1)}×` }}
      accessibilityActions={[{ name: 'increment', label: 'Faster' }, { name: 'decrement', label: 'Slower' }]}
      onAccessibilityAction={(e) => props.onChange(clampRate(props.rate + (e.nativeEvent.actionName === 'increment' ? RATE_STEP : -RATE_STEP)))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={move}
      onResponderMove={move}
      onResponderRelease={(e) => { const r = at(e); setDrag(undefined); last.current = r; props.onChange(r); }}
      onResponderTerminate={() => setDrag(undefined)}
      style={{ width: size, height: size }}
    >
      <Box pointerEvents="none" style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {ticks(size, shown).map((t) => (
            <Line key={t.k} x1={t.x1.toFixed(1)} y1={t.y1.toFixed(1)} x2={t.x2.toFixed(1)} y2={t.y2.toFixed(1)} stroke={t.lit ? playedColour(t.k, DIAL_TICKS - 1, c.hot) : colour.barIdle} strokeWidth={t.big ? 3.5 : 2.5} strokeLinecap="round" />
          ))}
        </Svg>
        <Box className="absolute rounded-pill items-center justify-center" style={{ left: knob.x - KNOB / 2 - HALO, top: knob.y - KNOB / 2 - HALO, width: KNOB + HALO * 2, height: KNOB + HALO * 2, backgroundColor: colour.grab }}>
          <Box className="rounded-pill bg-text" style={{ width: KNOB, height: KNOB }} />
        </Box>
        <Box className="absolute inset-0 items-center justify-center">
          <Type step="heading" className="text-text font-extrabold" style={[tabular, { fontSize: Math.round(size * 0.2), lineHeight: Math.round(size * 0.26) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{`${shown.toFixed(1)}×`}</Type>
          <Cap style={{ marginTop: PLAYER.showGap }}>Speed</Cap>
        </Box>
        <Type step="mono" className="absolute text-text3" style={{ left: size / 2 - (size / 2 - 18) * 0.72 - 2, bottom: 2, fontSize: PLAYER.dialEnd, lineHeight: PLAYER.dialEndLine }} numberOfLines={1}>0.5</Type>
        <Type step="mono" className="absolute text-text3" style={{ right: size / 2 - (size / 2 - 18) * 0.72 - 6, bottom: 2, fontSize: PLAYER.dialEnd, lineHeight: PLAYER.dialEndLine }} numberOfLines={1}>3.0</Type>
      </Box>
    </Box>
  );
}
