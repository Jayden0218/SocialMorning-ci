// Spec 039 US1/US3 (T011): Page, Section, TileGrid, Shelf and InlineNotice keep one gutter, one rhythm and a clear foot.
/**
 * Written BEFORE the components: red until `src/ui/kit/layout` exists. Asks: the scroll content's bottom padding is
 * `bottomInset(safe, { tabs, now })` for the four tabs / now pairs; children sit at the 20 gutter; a Section draws its heading and an optional
 * "See all"; a TileGrid is two equal columns 12 apart; a Shelf bleeds to the right edge only; an InlineNotice has words and a 44 button.
 * The break that turns it red: pad the foot with `safe` alone, or put the Shelf's padding on both sides.
 */
import { createElement, createRef } from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bottomInset, spacing } from '@/design';
import { Page, Section, TileGrid, Shelf, InlineNotice } from '@/ui/kit/layout';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

const mockScrollToTop = jest.fn();
jest.mock('expo-router', () => ({ useScrollToTop: (ref: unknown) => mockScrollToTop(ref) }));

const SAFE = 34;
const mounted: ReactTestRenderer[] = [];
afterEach(() => { mockScrollToTop.mockClear(); act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
function render(node: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: SAFE, left: 0, right: 0 } }, node)); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.findAll((n) => n.props['testID'] === id)[0]!;
const words = (r: ReactTestRenderer): string[] => r.root.findAll((n) => n.type === RNText).map((x) => [x.props['children']].flat(5).join(''));

describe('Page', () => {
  it.each([[false, false], [true, false], [false, true], [true, true]])('the foot of the scroll content clears the bars: tabs=%s now=%s', (tabs, now) => {
    const r = render(createElement(Page, { title: 'Me', tabs, now }, createElement(RNText, null, 'x')));
    const content = byId(r, 'page-scroll');
    const s = flat({ props: { style: content.props['contentContainerStyle'] } } as never);
    expect(s['paddingBottom']).toBe(bottomInset(SAFE, { tabs, now }));
  });

  it('children sit at the 20 gutter, with 24 between sections', () => {
    const r = render(createElement(Page, { title: 'Me' }, createElement(RNText, null, 'x')));
    const s = flat({ props: { style: byId(r, 'page-scroll').props['contentContainerStyle'] } } as never);
    expect(s['paddingHorizontal']).toBe(spacing.screenX);
    expect(s['gap']).toBe(spacing.block);
  });

  // 039 integration: the spoken page name (036 A4) and the scroll handle the old Discover page had.
  it('titleLabel is the header\'s spoken name; without it the title is', () => {
    const header = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityRole'] === 'header')[0]!;
    expect(header(render(createElement(Page, { title: 'Discover', titleLabel: "Discover, today's picks" }))).props['accessibilityLabel']).toBe("Discover, today's picks");
    expect(header(render(createElement(Page, { title: 'Discover' }))).props['accessibilityLabel']).toBe('Discover');
  });

  it('scrollRef reaches the ScrollView, so a page can scroll programmatically', () => {
    const ref = createRef<{ scrollTo: unknown }>();
    render(createElement(Page, { title: 'Me', scrollRef: ref as never }));
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current!.scrollTo).toBe('function');
  });

  it('scrollToTopOnTabPress hands the scroll view to useScrollToTop; without it the hook is not called', () => {
    render(createElement(Page, { title: 'Me' }));
    expect(mockScrollToTop).not.toHaveBeenCalled();
    render(createElement(Page, { title: 'Me', tabs: true, scrollToTopOnTabPress: true }));
    expect(mockScrollToTop).toHaveBeenCalled();
    const target = mockScrollToTop.mock.calls[0]![0] as { current: { scrollTo?: unknown } | null };
    expect(typeof target.current?.scrollTo).toBe('function');
  });

  it('draws the title, with Back and actions in their slots', () => {
    const r = render(createElement(Page, { title: 'Me', leading: createElement(RNText, null, 'BACK'), trailing: createElement(RNText, null, 'ACT') }));
    expect(words(r)).toEqual(expect.arrayContaining(['Me', 'BACK', 'ACT']));
  });
});

describe('Section', () => {
  it('draws its heading and, when asked, a See all link that fires', () => {
    const onSeeAll = jest.fn();
    const r = render(createElement(Section, { title: 'Moments', onSeeAll }, createElement(RNText, null, 'body')));
    expect(words(r)).toEqual(expect.arrayContaining(['Moments', 'See all', 'body']));
    const link = r.root.findAll((n) => n.props['accessibilityLabel'] === 'See all Moments' && typeof n.props['onPress'] === 'function')[0]!;
    act(() => link.props['onPress']());
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  it('draws no See all without a handler', () => {
    const r = render(createElement(Section, { title: 'Moments' }, createElement(RNText, null, 'body')));
    expect(words(r)).not.toContain('See all');
  });
});

describe('TileGrid', () => {
  it('is two equal columns with a 12 gap, in both directions', () => {
    const r = render(createElement(TileGrid, null, [1, 2, 3, 4, 5].map((k) => createElement(RNText, { key: k }, `t${k}`))));
    expect(flat(byId(r, 'tile-grid'))['gap']).toBe(spacing.row);
    const rows = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'tile-row');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(flat(row)['flexDirection']).toBe('row');
      expect(flat(row)['gap']).toBe(spacing.row);
    }
    // five tiles: the last row keeps an empty cell so the odd tile is the same width as the others
    const cells = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'tile-cell');
    expect(cells).toHaveLength(6);
    for (const c of cells) expect(flat(c)['flex']).toBe(1);
  });
});

describe('Shelf', () => {
  it('bleeds to the right edge only: a negative right margin of the gutter, padding only on the left', () => {
    const r = render(createElement(Shelf, null, createElement(RNText, null, 'card')));
    const shelf = byId(r, 'shelf');
    expect(shelf.props['horizontal']).toBe(true);
    const outer = flat(shelf);
    expect(outer['marginRight']).toBe(-spacing.screenX);
    expect(outer['marginLeft']).toBeUndefined();
    const inner = flat({ props: { style: shelf.props['contentContainerStyle'] } } as never);
    expect(inner['paddingRight']).toBe(spacing.screenX);
    expect(inner['paddingLeft']).toBeUndefined();
    expect(inner['paddingHorizontal']).toBeUndefined();
  });
});

describe('InlineNotice', () => {
  it('draws its words and an action at least 44 tall that fires', () => {
    const onAction = jest.fn();
    const r = render(createElement(InlineNotice, { text: 'You are offline', actionLabel: 'Retry', onAction }));
    expect(words(r)).toEqual(expect.arrayContaining(['You are offline', 'Retry']));
    const button = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Retry' && typeof n.props['onPress'] === 'function')[0]!;
    expect(Number(flat(button)['minHeight'])).toBeGreaterThanOrEqual(44);
    act(() => button.props['onPress']());
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
