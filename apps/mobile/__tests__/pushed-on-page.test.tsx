// 039 T031 (D6): a pushed page whose content is plain children is built on Page: the same foot, gutter and title row.
/**
 * Red before PushedPage was rebuilt on Page: it had no scroll view, no gutter and no `page-title-row`. Asks of a pushed page with plain children:
 * the scroll content's bottom padding is `bottomInset(strip, { tabs: false, now })` (strip = 0 by default, because the root layout pads the home
 * strip once (guard G-T1); `safeBottom` for a modal route that pads itself), the children sit on the gutter with 24 between them, and the title
 * row is Page's: Back leading, the actions trailing, the title in the `title` step as the page's header.
 * A page that gives a FUNCTION as children (80 of 87 call sites: they own a FlatList or ScrollView) keeps the frame it had; `pushed-keyboard`,
 * `title-top` and the rest pin that.
 * The breaks that turn it red: render plain children outside Page; pad with the context's bottom although the root already did; drop `leading`.
 */
import { createElement } from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bottomInset, spacing } from '@/design';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useScrollToTop: jest.fn(), router: { push: jest.fn(), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true }, usePathname: () => '/x' }));
let mockNow = false;
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: mockNow, player: false }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import { PushedPage } from '@/ui/kit/PushedPage';

const SAFE = 34;
let r: ReactTestRenderer;
afterEach(() => { act(() => r?.unmount()); mockNow = false; mockBack.mockClear(); });
const mount = (props: Record<string, unknown> = {}, children: React.ReactNode = createElement(RNText, null, 'body')) => {
  act(() => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: SAFE, left: 0, right: 0 } },
      createElement(PushedPage as React.ComponentType<Record<string, unknown>>, { title: 'Blocked', ...props }, children)));
  });
};
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const byId = (id: string): ReactTestInstance => r.root.findAll((n) => n.props['testID'] === id)[0]!;
const content = (): Record<string, unknown> => flat(byId('page-scroll').props['contentContainerStyle']);

describe('a pushed page with plain children is a Page', () => {
  it.each([[false], [true]])('the foot clears the bars: now=%s, root-padded', (now) => {
    mount({ now });
    expect(content()['paddingBottom']).toBe(bottomInset(0, { tabs: false, now }));
  });

  it('a modal route that pads its own home strip (safeBottom) adds it, as Page does with the safe inset', () => {
    mount({ safeBottom: SAFE, now: true });
    expect(content()['paddingBottom']).toBe(bottomInset(SAFE, { tabs: false, now: true }));
  });

  it('left out, `now` follows the toast placement (the bar shows)', () => {
    mockNow = true;
    mount();
    expect(content()['paddingBottom']).toBe(bottomInset(0, { tabs: false, now: true }));
  });

  it('children sit on the gutter with 24 between them', () => {
    mount();
    expect(content()['paddingHorizontal']).toBe(spacing.screenX);
    expect(content()['gap']).toBe(spacing.block);
  });

  it('the title row is Page\'s: Back leading, actions trailing, the title the page\'s header', () => {
    const onAct = jest.fn();
    mount({ actions: [{ icon: 'create-outline', label: 'Edit', onPress: onAct }] });
    const row = byId('page-title-row');
    const labels = row.findAll((n) => typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel']);
    expect(labels).toEqual(expect.arrayContaining(['Back', 'Edit']));
    expect(labels.indexOf('Back')).toBeLessThan(labels.indexOf('Blocked'));
    expect(labels.indexOf('Blocked')).toBeLessThan(labels.indexOf('Edit'));
    const header = row.findAll((n) => n.props['accessibilityRole'] === 'header')[0]!;
    expect(header.props['accessibilityLabel']).toBe('Blocked');
  });

  it('Back goes back; `onBack={null}` shows none; a custom onBack replaces it', () => {
    const find = (label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
    mount();
    act(() => { (find('Back')!.props['onPress'] as () => void)(); });
    expect(mockBack).toHaveBeenCalled();
    act(() => r.unmount());
    mount({ onBack: null });
    expect(find('Back')).toBeUndefined();
    act(() => r.unmount());
    const mine = jest.fn();
    mount({ onBack: mine, backLabel: 'Close', backIcon: 'close' });
    act(() => { (find('Close')!.props['onPress'] as () => void)(); });
    expect(mine).toHaveBeenCalled();
  });

  it('the subtitle, the field under the title, `right` and the `below` slot are all drawn', () => {
    mount({ subtitle: 'Shows you follow', extra: createElement(RNText, null, 'FIELD'), right: createElement(RNText, null, 'SAVE'), below: createElement(RNText, null, 'FOOT'), belowHeight: 44 });
    const words = r.root.findAll((n) => n.type === RNText).map((x) => [x.props['children']].flat(5).join(''));
    expect(words).toEqual(expect.arrayContaining(['Shows you follow', 'FIELD', 'SAVE', 'FOOT']));
    expect(content()['paddingBottom']).toBe(bottomInset(0, { tabs: false, now: false }) + 44 + 12);
  });
});
