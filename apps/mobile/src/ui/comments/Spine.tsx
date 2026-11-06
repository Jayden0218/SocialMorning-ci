// The loading placeholder of the comment-style pages: raise bars, breathing.
/**
 * M31 W2-B drew a time spine here (a 2 px hot-to-violet line, a node's chip column, a tick, the replies stage's glow). Spec 039 I2: no page hangs anything on a
 * spine any more (comments, replies, history, notifications, likes are cards in the page's flow on the gutter), so `SpineLine`, `SpineNode`, `Tick` and `StageGlow`
 * are deleted with their tests. `GhostRows` stays under its old file name: the bars start at the page's gutter like the content they stand in for.
 */
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { Box } from '@/ui/lib/box';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { colour, motion, radius, spacing } from '@/design';

/** Loading: ghost rows (raise bars, breathing) in the page's flow. */
export function GhostRows(props: { rows?: number }): React.ReactElement {
  const still = useReducedMotion();
  const [o] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (still) { o.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.5, duration: motion.breathe / 2, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: motion.breathe / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, o]);
  const widths = [100, 70, 88, 100, 60];
  return (
    <Box accessible accessibilityLabel="Loading" accessibilityLiveRegion="polite" style={{ gap: spacing.row }} testID="ghost-rows">
      {Array.from({ length: props.rows ?? 5 }, (_, k) => (
        <Animated.View key={k} style={{ height: k % 3 === 0 ? 64 : 14, width: `${widths[k % 5]}%`, borderRadius: radius.small, backgroundColor: colour.raise, opacity: o }} />
      ))}
    </Box>
  );
}
