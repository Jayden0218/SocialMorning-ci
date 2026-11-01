// Tests that a pushed page's title bar (with Post, Send, Save) rises above the keyboard while it is up.
/**
 * 035 M4 / T015 (device check B2; FR-004; US2). On Text status the title bar with Post sat under the keyboard, so Maestro's tap on
 * Post landed on the keys and nothing posted (run 41274515878, r11). A pushed page places its title bar from the page's foot; the
 * keyboard covers that foot. `usePushedLayout` now adds the keyboard's reported height (never a constant: it may be undocked, or
 * show predictive text), and the `below` slot rides with it.
 * The keyboard is driven through `Keyboard.addListener`'s handlers (React Native exposes no public emit): `keyboardWillShow`
 * carries `endCoordinates.height`, as iOS sends it.
 * Breaks that turn it red: drop the keyboard height from `usePushedLayout`'s `titleBottom`; leave it off the `below` slot; make the
 * hook ignore `keyboardWillHide` (the bar would stay up after the keys are gone).
 */
import { createElement } from 'react';
import { Keyboard, Platform, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }, usePathname: () => '/status/text' }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import { PushedPage } from '@/ui/kit/PushedPage';

type Handler = (e: { endCoordinates: { height: number } }) => void;
let handlers: Record<string, Handler[]> = {};
beforeEach(() => {
  handlers = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: Handler) => {
    (handlers[name] ??= []).push(fn);
    return { remove: () => { handlers[name] = (handlers[name] ?? []).filter((h) => h !== fn); } };
  }) as never);
});
afterEach(() => { jest.restoreAllMocks(); });
const emit = (name: string, height = 0) => act(() => { for (const h of handlers[name] ?? []) h({ endCoordinates: { height } }); });

let r: ReactTestRenderer;
afterEach(() => { act(() => r?.unmount()); });
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const mount = (below?: React.ReactNode) => {
  act(() => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 0, left: 0, right: 0 } },
      createElement(PushedPage as React.ComponentType<Record<string, unknown>>, { title: 'Text status', right: createElement(Box, { testID: 'post' }), ...(below ? { below, belowHeight: 52 } : {}) }, null)));
  });
};
/** The title bar's own box: the absolute row that holds the title (`title-bar-title`'s ancestor with a `bottom`). */
const titleBottom = (): number => {
  const title = r.root.findAll((n) => n.props['testID'] === 'title-bar-title' && typeof n.type === 'string')[0]!;
  let n: ReactTestInstance | null = title;
  while (n) { const b = flat(n)['bottom']; if (typeof b === 'number') return b; n = n.parent; }
  throw new Error('no title bar bottom');
};
const belowBottom = (): number => flat(r.root.findAll((n) => n.props['testID'] === 'pushed-below' && typeof n.type === 'string')[0]!)['bottom'] as number;

describe('on iOS', () => {
  beforeEach(() => { Platform.OS = 'ios'; });

  it('at rest the title bar sits at its usual spot, below 100', () => {
    mount();
    expect(titleBottom()).toBeLessThan(100);
  });

  it('with the keyboard up (300) the title bar sits at or above 300', () => {
    mount();
    emit('keyboardWillShow', 300);
    expect(titleBottom()).toBeGreaterThanOrEqual(300);
  });

  it('the keyboard is read from its event, not a constant: 216 and 335 give different spots', () => {
    mount();
    emit('keyboardWillShow', 216);
    const a = titleBottom();
    emit('keyboardWillShow', 335);
    expect(titleBottom() - a).toBe(335 - 216);
  });

  it('the `below` slot rides above the keyboard too', () => {
    mount(createElement(Box, { testID: 'below-child' }));
    emit('keyboardWillShow', 300);
    expect(belowBottom()).toBeGreaterThanOrEqual(300);
  });

  it('when the keyboard hides the title bar returns to its usual spot', () => {
    mount();
    const rest = titleBottom();
    emit('keyboardWillShow', 300);
    emit('keyboardWillHide');
    expect(titleBottom()).toBe(rest);
  });
});
