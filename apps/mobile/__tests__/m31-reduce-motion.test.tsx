// Reduce Motion: the swipe card snaps to rest (no spring) and the scan screen reads the one hook, not AccessibilityInfo.
/**
 * M31 T081. The breaks that turn it red: in SwipeCard `rest()` always call `Animated.spring` (the spring test), or in
 * app/scan.tsx call `AccessibilityInfo.isReduceMotionEnabled` itself (scripts/reduce-motion-check.test.mjs and the scan test).
 */
import { createElement } from 'react';
import { Animated } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SwipeCard } from '@/ui/library/SwipeCard';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const touch = { touchHistory: { indexOfSingleActiveTouch: -1, mostRecentTimeStamp: 0, numberActiveTouches: 0, touchBank: [] }, nativeEvent: {}, } as never;

async function card(): Promise<{ terminate: () => void; y: () => unknown }> {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(createElement(SwipeCard, { onUp: jest.fn(), onDown: jest.fn(), children: null })); });
  const node = r.root.findAll((n) => n.props.testID === 'swipe-card' && typeof n.type === 'string')[0]!;
  return { terminate: () => { act(() => { (node.props.onResponderTerminate as (e: unknown) => void)(touch); }); }, y: () => node.props.style };
}

afterEach(() => { setReducedMotionForTest(undefined); jest.restoreAllMocks(); });

it('a drag released springs back as before', async () => {
  setReducedMotionForTest(false);
  const spring = jest.spyOn(Animated, 'spring');
  (await card()).terminate();
  expect(spring).toHaveBeenCalledTimes(1);
});

it('under Reduce Motion the card snaps to rest and starts no spring', async () => {
  setReducedMotionForTest(true);
  const spring = jest.spyOn(Animated, 'spring');
  (await card()).terminate();
  expect(spring).not.toHaveBeenCalled();
});
