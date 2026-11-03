// Tests that a short Capsule chip ("All", "Newest" on the replies page) is at least 44 pt wide, not only tall.
/**
 * 036 (run 41615854342, `reduce_motion` default): the replies page's "All" chip measured 43 x 44 on the device (a hugging chip is as wide as its word + padding, and "All" is short),
 * 1 pt under the frame guard. A hugging chip's tap frame now has `minWidth` 44 as well as `minHeight` 44.
 * The break that turns it red: remove `minWidth` from the chip's Pressable in `Capsule` (`src/ui/comments/CommentsBottom.tsx`).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { bars } from '@/design';
import { Capsule } from '@/ui/comments/CommentsBottom';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/x', Link: ({ children }: { children: unknown }) => children }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }), useToast: () => jest.fn() }));

const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
let r: ReactTestRenderer | undefined;
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { r?.unmount(); }); r = undefined; setReducedMotionForTest(undefined); });

it('a hugging chip with a short word ("All") has a tap frame at least 44 wide and 44 tall', () => {
  act(() => { r = create(createElement(Capsule, { items: [{ value: 'a', label: 'All' }, { value: 'b', label: 'Newest' }], value: 'a', onChange: jest.fn(), hug: true })); });
  const tabs = r!.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tab');
  expect(tabs).toHaveLength(2);
  tabs.forEach((t) => {
    expect(flat(t)['minWidth']).toBe(bars.circle);
    expect(flat(t)['minHeight']).toBe(bars.circle);
  });
});
