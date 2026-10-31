// A card that can be swiped up or down (Updates deck): up = Mark played, down = Remove.
/**
 * M31 D-A (design-pulse2 `index.html#updates--screen`). A PanResponder that claims a drag only when it leans up or down (`leansVertical`),
 * so the deck's sideways scroll keeps working; the card follows the finger a little, runs `onUp` / `onDown` on a long enough release
 * (`swipeIntent`) and springs back. While a finger is down `onDragging(true)` lets the page stop its own vertical scroll. Every swipe is
 * also an accessibility action on the card (`swipeA11y`), so nothing is reachable by swipe alone.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { swipeIntent, leansVertical } from './swipe';

const FOLLOW = 0.4;

export function SwipeCard(props: { onUp: () => void; onDown: () => void; onDragging?: (on: boolean) => void; children: React.ReactNode }): React.ReactElement {
  const [y] = useState(() => new Animated.Value(0));
  const live = useRef(props);
  useEffect(() => { live.current = props; });
  // Under Reduce Motion the card snaps back to rest with no spring (M31 T081).
  const reduce = useRef(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => { reduce.current = reduceMotion; });
  const [pan] = useState(() => {
    const rest = () => { if (reduce.current) y.setValue(0); else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(); };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => leansVertical(g.dx, g.dy),
      onPanResponderGrant: () => live.current.onDragging?.(true),
      onPanResponderMove: (_e, g) => y.setValue(g.dy * FOLLOW),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        live.current.onDragging?.(false);
        rest();
        const intent = swipeIntent(g.dx, g.dy);
        if (intent === 'up') live.current.onUp();
        else if (intent === 'down') live.current.onDown();
      },
      onPanResponderTerminate: () => { live.current.onDragging?.(false); rest(); },
    });
  });
  return <Animated.View testID="swipe-card" style={{ flex: 1, transform: [{ translateY: y }] }} {...pan.panHandlers}>{props.children}</Animated.View>;
}
