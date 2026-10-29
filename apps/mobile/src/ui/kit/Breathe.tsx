// Fades what is inside it between full and half strength, slowly, while something loads.
/**
 * M31 W6-C (design-pulse2 kit.css `.breathe`: opacity 1 → .5 → 1 on 2.4 s; "Reduce Motion: no breathe"):
 * the loading curve and the ghost rows breathe through this one part, so the rule has one place — the phone's
 * Reduce Motion setting (via `useReducedMotion`) leaves it still at full strength, and the loop stops when the
 * part leaves the screen (no timer stays behind).
 */
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { motion } from '@/design';
import { useReducedMotion } from './useReducedMotion';

export function Breathe(props: { children: React.ReactNode; className?: string; style?: StyleProp<ViewStyle> }): React.ReactElement {
  const still = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (still) { opacity.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.5, duration: motion.breathe / 2, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: motion.breathe / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, opacity]);
  return <Animated.View testID="breathe" className={props.className} style={[props.style, { opacity }]}>{props.children}</Animated.View>;
}
