// The app's own loading sign: a breathing 12-bar curve with "Loading", or five small sound bars inside a button.
/**
 * SocialNet's own loading mark (owner, 2026-09-27), used instead of the platform spinner.
 * See `./loader-timing` for the timing. With Reduce Motion on, the bars stand still at rest —
 * the label still says "Loading".
 */
import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Breathe } from './Breathe';
import { Curve } from './Curve';
import { Type } from './Type';
import { useReducedMotion } from './useReducedMotion';
import { LOADER_BARS, LOADER_CYCLE_MS, barDelay, barRest } from './loader-timing';

/** The page loader's 12 bars (design-pulse2 `loaderBars`: 64 wide, 22 tall, min 4, gap 3, the played hot-to-violet run). */
const CURVE = [0.35, 0.6, 0.45, 0.8, 0.55, 1, 0.7, 0.9, 0.5, 0.75, 0.4, 0.6];
const CURVE_WIDTH = 64;

/**
 * M31 W6-C (design-pulse2 `states--loading-page`, `states--loading-inline`): a 12-bar curve that breathes, then "Loading"
 * in Geist 13 text3. The words are decoration for the eye; the row is one progress bar named by `label`.
 */
function PulseLoader(props: { label?: string; className?: string }): React.ReactElement {
  const label = props.label ?? 'Loading';
  return (
    <Box accessible accessibilityRole="progressbar" accessibilityLabel={label} className={`flex-row items-center justify-center gap-row ${props.className ?? ''}`}>
      <Breathe style={{ width: CURVE_WIDTH }}><Curve data={CURVE} count={12} height={22} min={4} gap={3} played={1} /></Breathe>
      <Type step="caption" className="text-text3" accessible={false} importantForAccessibility="no-hide-descendants">{label}</Type>
    </Box>
  );
}

/**
 * Two looks. With no `size`, `color` or `barClassName` it is the page / inline loader above. A busy button or the
 * pull-to-refresh asks for a size or a colour and gets the five small sound bars (they fit inside a button).
 */
export function Loader(props: { size?: number; label?: string; className?: string; color?: string; barClassName?: string }): React.ReactElement {
  if (props.size === undefined && props.color === undefined && props.barClassName === undefined) return <PulseLoader {...(props.label !== undefined ? { label: props.label } : {})} {...(props.className !== undefined ? { className: props.className } : {})} />;
  return <SoundBars {...props} />;
}

/** `color` / `barClassName` tint the bars (a busy button draws them in its words' colour); default the accent. */
function SoundBars(props: { size?: number; label?: string; className?: string; color?: string; barClassName?: string }): React.ReactElement {
  const size = props.size ?? 28;
  const barWidth = Math.max(3, Math.round(size / 8));
  const still = useReducedMotion();
  const [values] = useState(() => Array.from({ length: LOADER_BARS }, (_, i) => new Animated.Value(barRest(i))));

  useEffect(() => {
    if (still) return;
    const half = LOADER_CYCLE_MS / 2;
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(barDelay(i)),
          Animated.timing(v, { toValue: 1, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: barRest(i), duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.delay(LOADER_CYCLE_MS / 2 - barDelay(i)),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [still, values]);

  return (
    <Box
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={props.label ?? 'Loading'}
      className={`flex-row items-center justify-center ${props.className ?? ''}`}
      style={{ height: size, gap: barWidth }}
    >
      {values.map((v, i) => (
        <Animated.View
          key={i}
          className={`${props.color ? '' : props.barClassName ?? 'bg-accent'} rounded-pill`}
          style={{ width: barWidth, height: size, transform: [{ scaleY: v }], ...(props.color ? { backgroundColor: props.color } : null) }}
        />
      ))}
    </Box>
  );
}
