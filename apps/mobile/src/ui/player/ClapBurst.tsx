// A short full-screen burst of thumbs when the listener reacts; never blocks a tap; off with Reduce Motion.
/**
 * M21 US2 (spec story 2, scenario 7): tapping 👍 on shows a burst over the whole player for at most
 * `CLAP_MS` (≤ 1 s) — a handful of thumbs rise and fade from the middle. It is decoration only:
 * `pointerEvents="none"`, hidden from screen readers (the button itself says what happened), and
 * skipped when Reduce Motion is on (the `AccessibilityInfo.isReduceMotionEnabled` pattern of
 * src/ui/kit/Loader.tsx). React Native's `Animated` on the native driver, like the Loader.
 *
 * `trigger` is a counter: each increase plays the burst once; 0 plays nothing.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import { Icon } from '@/ui/kit/Icon';
import { usePlayerPalette } from '@/ui/player/palette';

export const CLAP_MS = 900;
/** Where each thumb flies to, from the centre: [dx, dy] in points. */
export const CLAP_PATHS: readonly (readonly [number, number])[] = [[-90, -150], [-40, -200], [0, -230], [45, -195], [95, -145], [-120, -60], [120, -70]];

export function ClapBurst(props: { trigger: number }): React.ReactElement | null {
  const c = usePlayerPalette();
  const [still, setStill] = useState(false);
  const [showing, setShowing] = useState(false);
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setStill(v); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (props.trigger === 0 || still) return;
    setShowing(true);
    t.setValue(0);
    const run = Animated.timing(t, { toValue: 1, duration: CLAP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true });
    run.start(() => setShowing(false));
    return () => run.stop();
  }, [props.trigger, still, t]);

  if (!showing) return null;
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] });
  const scale = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.2, 1] });
  return (
    <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[StyleSheet.absoluteFill, CENTRE]}>
      {CLAP_PATHS.map(([dx, dy], i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            opacity,
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
              { scale },
            ],
          }}
        >
          <Icon name="thumbs-up" size={i === 2 ? 56 : 36} color={c.accent} />
        </Animated.View>
      ))}
    </Animated.View>
  );
}

const CENTRE = { alignItems: 'center', justifyContent: 'center' } as const;
