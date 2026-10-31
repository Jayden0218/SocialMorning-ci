// A download's progress ring: hot to violet while it runs, white at 40 % when paused, a green check when done.
/**
 * M31 W3-B (T041; design-pulse2 `downloads--screen`, `arcBox(40, frac, …, { w: 4 })`): a 40 ring with a 4 stroke and
 * round caps, the track `#24242C` (the `line` colour). The arc starts at 12 o'clock and runs clockwise. Running:
 * the hot to violet gradient with the percent in mono 10 in the middle; paused: `barIdle` (white at 40 %); done: the
 * full gradient ring with an `ok`-green check (16). It is a picture of a number the tile already says in words
 * ("Downloading · 42 %"), so it is hidden from a screen reader.
 */
import { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { DOWNLOAD_RING, downloadsType } from './measures';

export type RingState = 'running' | 'paused' | 'done';

/** The arc's length as a share of the circle, 0–1. */
export function ringFraction(state: RingState, percent: number | undefined): number {
  if (state === 'done') return 1;
  return Math.min(1, Math.max(0, (percent ?? 0) / 100));
}

/** The settings panel's budget ring is the same drawing at 56 with a 5 stroke and "15%" in it. */
export function DownloadRing(props: { state: RingState; percent?: number | undefined; size?: number; stroke?: number; /** Words in the middle instead of the bare number. */ label?: string }): React.ReactElement {
  const size = props.size ?? DOWNLOAD_RING.size;
  const stroke = props.stroke ?? DOWNLOAD_RING.stroke;
  const id = `dr${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = ringFraction(props.state, props.percent);
  const arc = props.state === 'paused' ? colour.barIdle : `url(#${id})`;
  return (
    <Box testID="download-ring" accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colour.hot} />
            <Stop offset="1" stopColor={colour.violet} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour.line} strokeWidth={stroke} />
        {frac > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={arc} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * frac).toFixed(1)} ${c.toFixed(1)}`} /> : null}
      </Svg>
      <Box className="absolute inset-0 items-center justify-center">
        {props.state === 'done' ? <Icon name="checkmark" size={16} color={colour.ok} /> : <Type step="badge" className="text-text" style={downloadsType.percent}>{props.label ?? String(Math.round(frac * 100))}</Type>}
      </Box>
    </Box>
  );
}
