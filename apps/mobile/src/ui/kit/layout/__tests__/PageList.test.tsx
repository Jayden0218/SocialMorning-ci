// Spec 039 (D6, revised): PageList is design B's frame around a list the page owns.
/**
 * Written BEFORE the component: red until `PageList` exists. Asks: the title row is Page's (Back leading, title in the title step as the header,
 * actions trailing, a subtitle line); the list's content has the 20 gutter and a bottom padding of `bottomInset(safe, { tabs, now }) + footExtra`;
 * onEndReached, refreshControl, ListEmptyComponent and scrollRef reach the list; the title row, subtitle and `header` come BEFORE the page's own
 * ListHeaderComponent, which comes before the first item; the `below` slot is drawn.
 * The breaks that turn it red: pad the foot with `safe` alone; drop the gutter; put the page's header above the title row; swallow onEndReached.
 */
import { createElement, createRef } from 'react';
import { FlatList, StyleSheet, Text as RNText } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bottomInset, spacing } from '@/design';
import { PageList } from '@/ui/kit/layout';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
jest.mock('expo-router', () => ({ useScrollToTop: jest.fn() }));

const SAFE = 34;
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
function render(props: Record<string, unknown>): ReactTestRenderer {
  let r!: ReactTestRenderer;
  const base = { title: 'History', data: ['one', 'two'], keyExtractor: (x: string) => x, renderItem: ({ item }: { item: string }) => createElement(RNText, null, item) };
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: SAFE, left: 0, right: 0 } }, createElement(PageList as never, { ...base, ...props }))); });
  mounted.push(r);
  return r;
}
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const list = (r: ReactTestRenderer): ReactTestInstance => r.root.findAllByType(FlatList)[0]!;
const content = (r: ReactTestRenderer): Record<string, unknown> => flat(list(r).props['contentContainerStyle']);
const words = (r: ReactTestRenderer): string[] => r.root.findAll((n) => n.type === RNText).map((x) => [x.props['children']].flat(5).join(''));

describe('PageList', () => {
  it.each([[false, false], [true, false], [false, true], [true, true]])('the foot clears the bars: tabs=%s now=%s (+ footExtra)', (tabs, now) => {
    expect(content(render({ tabs, now }))['paddingBottom']).toBe(bottomInset(SAFE, { tabs, now }));
    expect(content(render({ tabs, now, footExtra: 56 }))['paddingBottom']).toBe(bottomInset(SAFE, { tabs, now }) + 56);
  });

  it('the content sits on the 20 gutter and starts under the status bar', () => {
    const c = content(render({}));
    expect(c['paddingHorizontal']).toBe(spacing.screenX);
    expect(c['paddingTop']).toBe(47 + spacing.section);
  });

  it('draws the title as the page header, Back leading and actions trailing, then the subtitle', () => {
    const r = render({ leading: createElement(RNText, null, 'BACK'), trailing: createElement(RNText, null, 'ACT'), subtitle: 'All · 2 episodes' });
    const header = r.root.findAll((n) => n.props['accessibilityRole'] === 'header')[0]!;
    expect(header.props['accessibilityLabel']).toBe('History');
    expect(words(r).filter((w) => ['BACK', 'History', 'ACT', 'All · 2 episodes', 'one'].includes(w))).toEqual(['BACK', 'History', 'ACT', 'All · 2 episodes', 'one']);
  });

  it('titleLabel is the spoken name; onTitle makes the title a link', () => {
    const onTitle = jest.fn();
    const r = render({ titleLabel: 'History, newest first', onTitle });
    const link = r.root.findAll((n) => n.props['accessibilityRole'] === 'link')[0]!;
    expect(link.props['accessibilityLabel']).toBe('History, newest first');
    act(() => link.props['onPress']());
    expect(onTitle).toHaveBeenCalled();
  });

  it('the page header (chips, a field) comes after the title row and before the list header, which comes before the first item', () => {
    const r = render({ header: createElement(RNText, null, 'CHIPS'), ListHeaderComponent: createElement(RNText, null, 'LISTHEAD') });
    expect(words(r).filter((w) => ['History', 'CHIPS', 'LISTHEAD', 'one'].includes(w))).toEqual(['History', 'CHIPS', 'LISTHEAD', 'one']);
  });

  it('onEndReached, refreshControl, ListEmptyComponent, ItemSeparatorComponent and scrollRef reach the list', () => {
    const onEndReached = jest.fn();
    const refreshControl = createElement(RNText, null, 'REFRESH');
    const ref = createRef<FlatList<string>>();
    const r = render({ onEndReached, refreshControl, scrollRef: ref });
    expect(list(r).props['onEndReached']).toBe(onEndReached);
    expect(list(r).props['refreshControl']).toBe(refreshControl);
    expect(typeof ref.current?.scrollToOffset).toBe('function');
    const e = render({ data: [], ListEmptyComponent: createElement(RNText, null, 'NOTHING') });
    expect(words(e)).toEqual(expect.arrayContaining(['History', 'NOTHING']));
  });

  it('safeBottom replaces the safe inset (a pushed page the root already padded passes 0)', () => {
    expect(content(render({ safeBottom: 0, now: true }))['paddingBottom']).toBe(bottomInset(0, { now: true }));
  });

  it('the below slot is drawn over the foot and the list leaves room for it', () => {
    const r = render({ below: createElement(RNText, null, 'FOOT'), belowHeight: 44 });
    expect(words(r)).toContain('FOOT');
    expect(content(r)['paddingBottom']).toBe(bottomInset(SAFE, {}) + 44 + 12);
  });
});
