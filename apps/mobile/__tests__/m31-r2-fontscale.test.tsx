// R2 (contact/fontscale2/README.md F7 F11, contact/widths/README.md W): Hot now, the Search tab cue, the HOST badge. Red where noted.
/**
 * F7   Discover "HOT NOW" at the 1.3 cap: the time ("14:32") is one line that shrinks to fit (EXPECTED TO PASS today); the "41 reacting" line is in the
 *      tile's normal flow AFTER the quote, not absolutely positioned at the bottom (it was `absolute`, so it overlapped the quote on a `minHeight` tile). RED.
 * F11  Search tabs: when the row is wider than the window there is a visible cue: the scroll indicator, or a right-edge gradient (`Fade`). When it fits, neither. RED.
 * W    HOST badge in a Comments row at 320 wide: one line, never shrinks (`flexShrink: 0`); the age text beside it shrinks instead. RED (flexShrink/numberOfLines).
 */
import { createElement } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { HotNowTile } from '@/ui/discover/DiscoverMosaic';
import { SearchZone } from '@/ui/search/SearchZone';
import { CommentRow } from '@/ui/comments/CommentRow';
import { LinearGradient } from '@/design/tailwind';
import type { Moment } from '@/discover/moments-api';
import type { Comment } from '@/social/api';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 320, height: 568, scale: 2, fontScale: 1.3 })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, Link: (p: { children?: unknown }) => p.children, usePathname: () => '/x' }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined, delete: () => undefined }, feedCache: {} }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {} }) }));

const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const say = (x: unknown): string => {
  if (x === null || x === undefined || typeof x === 'boolean') return '';
  if (typeof x === 'string' || typeof x === 'number') return String(x);
  if (Array.isArray(x)) return x.map(say).join('');
  return say((x as { props?: { children?: unknown } }).props?.children);
};
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, el)); });
  mounted.push(r);
  return r;
};
const texts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => String(n.type) === 'Text');

describe('R2-F7 Hot now at the 1.3 cap', () => {
  const HOT: Moment = { episodeId: 'h1', showTitle: 'S', episodeTitle: 'Hot ep', startMs: 872_000, endMs: 910_000, reactions: 41, rank: 1, followed: false, comments: [{ id: 'c', author: 'Rui', text: 'the part I replay', likes: 1 }] };
  const tile = (): ReactTestRenderer => render(createElement(HotNowTile, { moment: HOT, onPress: jest.fn() }));

  it('the time is one line that shrinks to fit', () => {
    const t = tile().root.findAll((n) => n.props['testID'] === 'hot-now-time' && String(n.type) === 'Text')[0]!;
    expect(t.props['numberOfLines']).toBe(1);
    expect(t.props['adjustsFontSizeToFit']).toBe(true);
  });

  it('"41 reacting" is a normal-flow sibling AFTER the quote, not absolutely positioned', () => {
    const r = tile();
    const reacting = texts(r).find((t) => say(t.props['children']) === '41 reacting')!;
    const quote = texts(r).find((t) => say(t.props['children']).startsWith('“'))!;
    expect(reacting).toBeDefined();
    expect(quote).toBeDefined();
    // nothing from the reacting Text up to the tile root is absolutely positioned
    for (let n: ReactTestInstance | null = reacting; n !== null; n = n.parent) {
      expect(flat(n)['position']).not.toBe('absolute');
      expect(String(n.props['className'] ?? '')).not.toMatch(/(^|\s)absolute(\s|$)/);
    }
    // and it comes after the quote in the tile's reading order
    const order = r.root.findAll((n) => n === quote || n === reacting);
    expect(order.indexOf(quote)).toBeLessThan(order.indexOf(reacting));
    // the quote is capped at 3 lines or fewer (the tile may grow, the lines may not run on)
    expect(Number(quote.props['numberOfLines'])).toBeLessThanOrEqual(3);
  });
});

describe('R2-F11 the Search tab row shows that it scrolls', () => {
  const zone = (): ReactTestRenderer => render(createElement(SearchZone, {
    bottom: 6, results: true, tab: 'all', onTab: jest.fn(), since: 'any', onSince: jest.fn(), term: 'Journey', placeholder: 'Search', autoFocus: false,
    onChangeText: jest.fn(), onSubmit: jest.fn(), onClear: jest.fn(), onCancel: jest.fn(), onScan: jest.fn(),
    field: { ref: { current: null }, onLayout: jest.fn(), style: {} }, fadeIn: new Animated.Value(1).interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
  } as never));
  const scrollers = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => n.props['horizontal'] === true);
  /** Lay the row out `layoutW` wide with `contentW` of tabs inside it, through whichever props the scroller (or its wrapper) offers. */
  const size = (r: ReactTestRenderer, layoutW: number, contentW: number): void => {
    act(() => {
      for (const s of scrollers(r)) {
        (s.props['onLayout'] as ((e: unknown) => void) | undefined)?.({ nativeEvent: { layout: { x: 0, y: 0, width: layoutW, height: 32 } } });
        (s.props['onContentSizeChange'] as ((w: number, h: number) => void) | undefined)?.(contentW, 32);
      }
    });
  };
  const cue = (r: ReactTestRenderer): boolean =>
    scrollers(r).some((s) => s.props['showsHorizontalScrollIndicator'] === true) || r.root.findAll((n) => n.type === LinearGradient).length > 0;

  it('the tabs are wider than the window: a cue is drawn (indicator or a right-edge Fade)', () => {
    const r = zone();
    size(r, 288, 560);
    expect(cue(r)).toBe(true);
  });
  it('the tabs fit: no cue', () => {
    const r = zone();
    size(r, 288, 200);
    expect(cue(r)).toBe(false);
  });
});

describe('R2-W the HOST badge at 320 wide', () => {
  const c: Comment = { id: 'c1', authorId: 'a1', displayName: 'A listener with a long display name here', body: 'hello', offsetMs: null, parentId: null, createdAt: '2026-10-07T00:00:00Z', deleted: false, host: true };
  const row = (): ReactTestRenderer => render(createElement(CommentRow, {
    c, serverTime: '2026-10-07T00:05:00Z', likeOf: () => ({ count: 0, liked: false }), onSeek: jest.fn(), onLike: jest.fn(), onMenu: jest.fn(),
  }));
  it('HOST is one line and never shrinks', () => {
    const host = texts(row()).find((t) => say(t.props['children']) === 'HOST')!;
    expect(host).toBeDefined();
    expect(host.props['numberOfLines']).toBe(1);
    expect(flat(host)['flexShrink']).toBe(0);
  });
  it('the age text beside it shrinks instead', () => {
    const r = row();
    const host = texts(r).find((t) => say(t.props['children']) === 'HOST')!;
    // the age is the other Text in the badge's row that carries the muted tag colour
    let head: ReactTestInstance = host.parent!;
    while (head.parent && head.findAll((n) => String(n.type) === 'Text' && n !== host).length < 2) head = head.parent;
    const age = head.findAll((n) => String(n.type) === 'Text' && /1 ?min|5 ?m|ago|now/.test(say(n.props['children'])))[0]!;
    expect(age).toBeDefined();
    expect(String(age.props['className'] ?? '') + JSON.stringify(flat(age))).toMatch(/flex-shrink|flexShrink":1/);
    expect(age.props['numberOfLines']).toBe(1);
  });
});
