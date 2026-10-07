// Checks that a swipe row shows its actions, runs a lone action on a full swipe, and offers each as a screen-reader action.
/**
 * M22 US12 (FR-036/037). gesture-handler's swipeable needs native worklets, so it is replaced by
 * a stand-in (`setSwipeableForTests`) that draws both action panels and keeps its props, letting
 * the test "open" a side.
 *
 * The break that turns it red: drop `swipeA11y(all)` from SwipeRow (no accessibility actions), or
 * swap the sides in `onSwipeableOpen`.
 */
import { createElement } from 'react';
import { Text, View } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

type SwipeProps = {
  children?: React.ReactNode;
  enabled?: boolean;
  renderLeftActions?: () => React.ReactNode;
  renderRightActions?: () => React.ReactNode;
  onSwipeableOpen?: (direction: 'left' | 'right') => void;
};
const mockSwipe: { last?: SwipeProps } = {};

function Swipeable(props: SwipeProps) {
  mockSwipe.last = props;
  return createElement(View, null, props.renderLeftActions?.(), props.children, props.renderRightActions?.());
}

import { setSwipeableForTests, SwipeRow, swipeA11y, type SwipeAction } from '@/ui/kit/SwipeRow';

beforeEach(() => setSwipeableForTests({ default: Swipeable, SwipeDirection: { LEFT: 'left', RIGHT: 'right' } } as never));

function render(left: SwipeAction[], right: SwipeAction[], enabled?: boolean): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(SwipeRow, { swipeLeft: left, swipeRight: right, ...(enabled !== undefined ? { enabled } : {}), children: createElement(Text, null, 'Episode') }));
  });
  return r;
}

const button = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;

it('a swipe left shows its actions; a tap runs one', () => {
  const queue = jest.fn();
  const removeFn = jest.fn();
  const played = jest.fn();
  const r = render([{ key: 'queue', label: 'Queue', onPress: queue }, { key: 'remove', label: 'Remove from Updates', onPress: removeFn }], [{ key: 'played', label: 'Mark played', onPress: played }]);
  act(() => { button(r, 'Remove from Updates').props['onPress'](); });
  expect(removeFn).toHaveBeenCalledTimes(1);
  expect(queue).not.toHaveBeenCalled();
  // Two actions on the left swipe: opening shows them, it runs nothing.
  act(() => { mockSwipe.last!.onSwipeableOpen!('left'); });
  expect(queue).not.toHaveBeenCalled();
  // One action on the right swipe: the full swipe runs it.
  act(() => { mockSwipe.last!.onSwipeableOpen!('right'); });
  expect(played).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('every action is also an accessibility action on the row', () => {
  const queue = jest.fn();
  const played = jest.fn();
  const r = render([{ key: 'queue', label: 'Queue', onPress: queue }], [{ key: 'played', label: 'Mark played', onPress: played }]);
  const row = r.root.findAll((n) => Array.isArray(n.props['accessibilityActions']))[0]!;
  expect(row.props['accessibilityActions']).toEqual([{ name: 'queue', label: 'Queue' }, { name: 'played', label: 'Mark played' }]);
  act(() => { row.props['onAccessibilityAction']({ nativeEvent: { actionName: 'played' } }); });
  expect(played).toHaveBeenCalledTimes(1);
  act(() => { row.props['onAccessibilityAction']({ nativeEvent: { actionName: 'nothing' } }); });
  expect(queue).not.toHaveBeenCalled();
  act(() => r.unmount());
});

it('no actions or enabled=false → the row does not swipe; swipeA11y alone gives the same props', () => {
  const r = render([], []);
  expect(mockSwipe.last!.enabled).toBe(false);
  expect(mockSwipe.last!.renderLeftActions).toBeUndefined();
  act(() => r.unmount());
  const off = render([{ key: 'queue', label: 'Queue', onPress: jest.fn() }], [], false);
  expect(mockSwipe.last!.enabled).toBe(false);
  act(() => off.unmount());
  const fn = jest.fn();
  const a11y = swipeA11y([{ key: 'remove', label: 'Remove', onPress: fn }]);
  expect(a11y.accessibilityActions).toEqual([{ name: 'remove', label: 'Remove' }]);
  a11y.onAccessibilityAction({ nativeEvent: { actionName: 'remove' } } as never);
  expect(fn).toHaveBeenCalledTimes(1);
});

it('without the swipeable (as in every other Jest test) the row is plain, with the actions for a screen reader', () => {
  setSwipeableForTests(null);
  const fn = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SwipeRow, { swipeLeft: [{ key: 'remove', label: 'Remove', onPress: fn }], children: createElement(Text, null, 'Row') })); });
  const row = r.root.findAll((n) => Array.isArray(n.props['accessibilityActions']))[0]!;
  act(() => { row.props['onAccessibilityAction']({ nativeEvent: { actionName: 'remove' } }); });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(r.toJSON())).toContain('Row');
  act(() => r.unmount());
});
