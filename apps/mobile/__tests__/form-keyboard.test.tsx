// Tests that a form page's foot slot (Send, Save) rises above the keyboard while it is up and the title row stays put.
/**
 * 035 M4 / T015 (device check B2; FR-004; US2). On Text status the title bar with Post sat under the keyboard, so Maestro's tap on
 * Post landed on the keys and nothing posted (run 41274515878, r11). A pushed page places its title bar from the page's foot; the
 * keyboard covers that foot. 039: `PushedPage` is retired; the same rule now lives in `FormPage`, which adds the keyboard's reported height (never a constant: it may be undocked, or
 * show predictive text), and the `below` slot rides with it. (This file was pushed-keyboard.test.tsx, run on PushedPage.)
 * The keyboard is driven through `Keyboard.addListener`'s handlers (React Native exposes no public emit): `keyboardWillShow`
 * carries `endCoordinates.height`, as iOS sends it.
 * Breaks that turn it red: drop the keyboard height from `FormFrame`'s `titleBottom`; leave it off the `below` slot; make the
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

import { FormPage } from '@/ui/form/FormPage';

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
      createElement(FormPage as React.ComponentType<Record<string, unknown>>, { title: 'Text status', trailing: createElement(Box, { testID: 'post' }), ...(below ? { below, belowHeight: 52 } : {}) }, null)));
  });
};
/**
 * 037 D1: this file pinned that the TITLE BAR (with Post, Send, Save) rides above the keyboard, because it stood at the page's foot. The title bar is at the top now, where the keyboard
 * can never cover it, so what rides is the page's foot slot (`below`: a composer, a Send button). The tests keep their keyboard-height arithmetic and now ask three things:
 * the bar stays at its top spot; the `below` slot rides (as `titleBottom` did); the bar does not move with the keyboard.
 */
// 039: the title is Page's title row, in the scroll content: it has no `top` of its own, and the keyboard cannot move it.
const titleTop = (): number | undefined => {
  const row = r.root.findAll((n) => n.props['testID'] === 'page-title-row' && typeof n.type === 'string')[0]!;
  return flat(row)['top'] as number | undefined;
};
const belowBottom = (): number => flat(r.root.findAll((n) => n.props['testID'] === 'pushed-below' && typeof n.type === 'string')[0]!)['bottom'] as number;

describe('on iOS', () => {
  beforeEach(() => { Platform.OS = 'ios'; });

  it('at rest the title row is in the flow (no top of its own) and the foot slot at the foot, below 100', () => {
    mount(createElement(Box, { testID: 'below-child' }));
    expect(titleTop()).toBeUndefined();
    expect(belowBottom()).toBeLessThan(100);
  });

  it('with the keyboard up (300) the title bar does not move: the keyboard cannot cover the top', () => {
    mount();
    emit('keyboardWillShow', 300);
    expect(titleTop()).toBeUndefined();
  });

  it('the keyboard is read from its event, not a constant: 216 and 335 give different spots for the foot slot', () => {
    mount(createElement(Box, { testID: 'below-child' }));
    emit('keyboardWillShow', 216);
    const a = belowBottom();
    emit('keyboardWillShow', 335);
    expect(belowBottom() - a).toBe(335 - 216);
    expect(titleTop()).toBeUndefined();
  });

  it('the `below` slot rides above the keyboard too', () => {
    mount(createElement(Box, { testID: 'below-child' }));
    emit('keyboardWillShow', 300);
    expect(belowBottom()).toBeGreaterThanOrEqual(300);
  });

  it('when the keyboard hides the foot slot returns to its usual spot', () => {
    mount(createElement(Box, { testID: 'below-child' }));
    const rest = belowBottom();
    emit('keyboardWillShow', 300);
    emit('keyboardWillHide');
    expect(belowBottom()).toBe(rest);
  });
});
