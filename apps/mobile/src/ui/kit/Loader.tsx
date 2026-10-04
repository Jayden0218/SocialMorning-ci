// The app's own loading sign: five sound bars moving up and down.
/**
 * SocialNet's own loading mark (owner, 2026-09-27), used instead of the platform spinner.
 * See `./loader-timing` for the timing. With Reduce Motion on, the bars stand still at rest —
 * the label still says "Loading".
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { Box } from '@/ui/lib/box';
import { LOADER_BARS, LOADER_CYCLE_MS, barDelay, barRest } from './loader-timing';

/** `color` / `barClassName` tint the bars (a busy button draws them in its words' colour); default the accent. */
export function Loader(props: { size?: number; label?: string; className?: string; color?: string; barClassName?: string }): React.ReactElement {
  const size = props.size ?? 28;
  const barWidth = Math.max(3, Math.round(size / 8));
  const [still, setStill] = useState(false);
  const values = useRef(Array.from({ length: LOADER_BARS }, (_, i) => new Animated.Value(barRest(i)))).current;

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setStill(v); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

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
