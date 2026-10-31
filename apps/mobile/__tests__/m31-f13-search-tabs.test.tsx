// Tests F13 (phase 1, red first): choosing People scrolls the Search tab row so the tab is on screen.
/**
 * M31 F13 (fontscale2 F11, widths W9). Written BEFORE the fix: at 320 wide the five tabs overflow and People stays off screen even when chosen
 * (a fade cue was added, but a chosen tab must be visible). When the selected tab changes, the row calls `scrollTo` (or `scrollToEnd`) on its ScrollView.
 * Break: remove the effect - red.
 */
import { createElement, createRef } from 'react';
import { Animated } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ScrollView } from '@/ui/lib/scroll-view';
import { SearchZone } from '@/ui/search/SearchZone';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 320, height: 568, scale: 3, fontScale: 1.3 })) }));

const zoneProps = (over: Record<string, unknown> = {}) => ({
  bottom: 6, results: true, tab: 'all' as const, onTab: jest.fn(), since: 'any' as const, onSince: jest.fn(), term: 'Journey', placeholder: 'Search', autoFocus: false,
  onChangeText: jest.fn(), onSubmit: jest.fn(), onClear: jest.fn(), onCancel: jest.fn(), onScan: jest.fn(),
  field: { ref: { current: null }, onLayout: jest.fn(), style: {} }, fadeIn: new Animated.Value(1).interpolate({ inputRange: [0, 1], outputRange: [0, 1] }), ...over,
});

it('choosing People scrolls the tab row (scrollTo / scrollToEnd on its ScrollView)', () => {
  // RN's jest ScrollView keeps `scrollTo` / `scrollToEnd` as shared jest.fn()s on its prototype chain: probe them, then watch.
  const probe = createRef<Record<string, jest.Mock>>();
  let p!: ReactTestRenderer;
  act(() => { p = create(createElement(ScrollView, { ref: probe as never, horizontal: true })); });
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(probe.current)) as Record<string, jest.Mock>;
  const scrollTo = proto['scrollTo']!;
  const scrollToEnd = proto['scrollToEnd']!;
  expect(jest.isMockFunction(scrollTo) && jest.isMockFunction(scrollToEnd)).toBe(true);
  act(() => p.unmount());
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SearchZone, zoneProps({ tab: 'all' }))); });
  scrollTo.mockClear(); scrollToEnd.mockClear();
  act(() => { r.update(createElement(SearchZone, zoneProps({ tab: 'people' }))); });
  expect(scrollTo.mock.calls.length + scrollToEnd.mock.calls.length).toBeGreaterThan(0);
  act(() => r.unmount());
});
