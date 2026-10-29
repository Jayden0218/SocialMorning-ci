// "My subscriptions" is not cut to "My subscrip…" beside the two title-bar circles.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-5b/README.md defect 2, wave-6 defect 4). Written BEFORE the fix: red today.
 * Drawing: design-pulse2 listen.html `subscriptions--screen` / `--grid` / `--empty`: `pushed({ title:'My subscriptions', size:26, actions:['grid','share'] })` — the title is
 * the whole name on two lines ("My" / "subscriptions"), the two circles at its end. At 26 the word "subscriptions" (about 240 wide in Unbounded 800) is wider than the room
 * beside a back circle and two action circles (about 180), so with `numberOfLines` 2 the second line ends in an ellipsis: "My subscrip…" (the capture). `TitleBar`'s F3 rule already lets a ONE-word
 * title run on under the circles (`reach`: a negative right margin, since the circles are drawn over its end); the rule keys on "no space in the title", which "My subscriptions" has.
 * What the test asks: with two circles, a title whose last word is long keeps both lines (numberOfLines >= 2) AND gets the room (marginRight < 0).
 * NOT asked (the drawings disagree): the "0 episodes" / "0 of 1 GB" lines on Queue and Downloads when empty — listen.html `queue--empty` and `downloads--empty`
 * draw them, shell.html `states--queue-empty` / `states--downloads-empty` do not; m31-w3b-queue / m31-w3b-downloads pin the listen.html ones. No test.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { TitleBar } from '@/ui/kit/TitleBar';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/subscriptions' }));

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const bar = (title: string, nActions: number, size?: number): ReactTestRenderer => {
  setReducedMotionForTest(true);
  const actions = [{ icon: 'grid-outline' as const, label: 'Show as a grid', onPress: () => undefined }, { icon: 'share-outline' as const, label: 'Share my list', onPress: () => undefined }].slice(0, nActions);
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(TitleBar, { title, bottom: 40, onBack: () => undefined, actions, ...(size ? { size } : {}) }))); });
  mounted.push(r);
  return r;
};
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const box = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => n.props['testID'] === 'title-bar-title')[0]!;
const label = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && typeof n.props['numberOfLines'] === 'number')[0]!;

describe('F9-4 a long title beside two circles', () => {
  it('"My subscriptions" at 26 with two circles: two lines kept, and the title runs under the circles (negative right margin)', () => {
    const r = bar('My subscriptions', 2, 26);
    expect(Number(label(r).props['numberOfLines'])).toBeGreaterThanOrEqual(2);
    expect(Number(flat(box(r))['marginRight'] ?? 0)).toBeLessThan(0);
  });
  it('a short two-word title keeps its plain box ("My queue" with two circles: no negative margin; expected to pass today)', () => {
    const r = bar('My queue', 2);
    expect(Number(flat(box(r))['marginRight'] ?? 0)).toBeLessThan(1);
    expect(Number(flat(box(r))['marginRight'] ?? 0)).toBeGreaterThan(-1);
  });
});
