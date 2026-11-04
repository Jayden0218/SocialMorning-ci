// Tests that a long title beside action circles never runs under them at large text, and chart-rules labels never break mid-word.
/**
 * 035 T052 (device check L3). "My subscriptions" ran into its two action circles at the largest text size: a one-long-word title is
 * let run on UNDER the circles (a negative right margin, F3, so "Downloads" does not wrap into letters at normal size). At large text
 * that reach is wrong: the title must keep to the room beside the circles and shrink to fit instead. And the chart rules' weight
 * labels ("comment") broke as "commen / t" in their narrow cells: they take one line and shrink.
 * Breaks that turn it red: restore the unconditional negative `marginRight` in TitleBar; drop `adjustsFontSizeToFit` from the label.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: mockScale })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true }, useRouter: () => ({ push: jest.fn() }), usePathname: () => '/x' }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => jest.fn() }));
jest.mock('@/config/store', () => ({ useAppConfig: () => ({}) }));

import { TitleBar } from '@/ui/kit/TitleBar';
import ChartRules from '../app/chart-rules';

let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));
const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

describe('TitleBar with action circles', () => {
  const draw = () => act(() => { r = create(createElement(TitleBar, { title: 'My subscriptions', top: 53, actions: [{ icon: 'search-outline', label: 'Search', onPress: jest.fn() }, { icon: 'filter-outline' as never, label: 'Order options', onPress: jest.fn() }] })); });
  const margin = (): number => Number(flat(r.root.findAll((n) => n.props['testID'] === 'title-bar-title')[0]!.props['style'])['marginRight'] ?? 0);
  // 037 D1: was "may run on under the circles" (margin < 0); the title is under the row at the full width now, so it never needs to.
  it('at normal size a long title keeps the whole width under the row (no run-on under the circles needed)', () => { mockScale = 1; draw(); expect(margin()).toBe(0); });
  it('at font scale 3.1 the title keeps to the room beside the circles', () => { mockScale = 3.1; draw(); expect(margin()).toBeGreaterThanOrEqual(0); });
});

it('chart rules: a weight label takes one line and shrinks instead of breaking mid-word', () => {
  mockScale = 3.1;
  act(() => { r = create(createElement(ChartRules)); });
  const label = r.root.findAll((n) => String(n.type) === 'Text' && n.children.length === 1 && n.children[0] === 'comment')[0];
  expect(label).toBeDefined();
  expect(label!.props['numberOfLines']).toBe(1);
  expect(label!.props['adjustsFontSizeToFit']).toBe(true);
});
