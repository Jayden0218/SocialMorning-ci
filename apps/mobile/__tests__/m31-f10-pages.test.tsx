// Episode, Me, Search and the count helpers at 200 % text and with huge counts: nothing cut, nothing broken mid-word, counts short.
/**
 * M31 F10 (FR-031; contact/fontscale2/README.md F8 F10 F11, contact/widths/README.md W1 W5 W9). Written BEFORE the fix: red where noted.
 *   F8   Episode: the title takes three lines at most (it took four and ran over the stats); "Play this episode" is one line (expected to PASS today:
 *        the pill already sets numberOfLines 1); the top pills are minHeight boxes and the row may shrink the date pill so the "hottest at" pill stays on screen (W5).
 *   F10  Me: a tile named by one word ("Notifications") is one line that shrinks to fit, not "Notificatio / ns".
 *   F11  Search: the tab row scrolls sideways (a horizontal ScrollView) so People and the NEW badge are reachable at 200 % and at 320 wide.
 *   W1   one shared `compactCount` (in '@/ui/kit/format': 999, 1.2k, 12.3k, 12.3M) is used for "listening now", "listened", comments, likes, replies and the rail;
 *        the three older copies (FollowList, UpdateEpisodeRow, moments-logic shortCount) keep their outputs.
 */
import { createElement } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { EpisodeTitleBlock } from '@/ui/episode/EpisodeTitleBlock';
import { EpisodeStage } from '@/ui/episode/EpisodeStage';
import { countsLine } from '@/ui/episode/stage';
import { episodeLayout } from '@/ui/episode/measures';
import { MenuTile } from '@/ui/me/parts';
import { SearchZone } from '@/ui/search/SearchZone';
import { liveLabel } from '@/social/live';
import * as format from '@/ui/kit/format';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 320, height: 568, scale: 2, fontScale: 2 })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/episode/e1' }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }), useToast: () => jest.fn() }));

const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const said = (n: ReactTestInstance): string => [n.props['children']].flat(5).map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : '')).join('');
const mounted: ReactTestRenderer[] = [];
beforeEach(() => { setReducedMotionForTest(true); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, el)); });
  mounted.push(r);
  return r;
};
const texts = (r: ReactTestRenderer | ReactTestInstance): ReactTestInstance[] => ('root' in r ? r.root : r).findAll((n) => String(n.type) === 'Text');

describe('F10-E1 the Episode title block (F8)', () => {
  const block = (): ReactTestRenderer => render(createElement(EpisodeTitleBlock, { title: 'Why mornings matter, and the long way round to the answer', showTitle: 'Morning Notes', playing: false, subscribed: false, onBack: jest.fn(), onShow: jest.fn(), onPlay: jest.fn(), onSubscribe: jest.fn(), onCopyTitle: jest.fn() }));
  it('the title takes three lines at most', () => {
    const t = texts(block()).find((x) => said(x).startsWith('Why mornings matter'))!;
    expect(Number(t.props['numberOfLines'])).toBeLessThanOrEqual(3);
  });
  it('"Play this episode" and "Subscribe" are one line each (expected to pass today)', () => {
    const r = block();
    for (const label of ['Play this episode', 'Subscribe']) {
      const t = texts(r).find((x) => said(x) === label)!;
      expect([label, t.props['numberOfLines']]).toEqual([label, 1]);
    }
  });
});

describe('F10-E2 the Episode top pills and counts (F8, W5, W1)', () => {
  const stage = (): ReactTestRenderer => render(createElement(EpisodeStage, {
    layout: episodeLayout({ top: 47 }), coverUrl: undefined, name: 'Morning Notes', date: 'TUE 27 OCT · 48:10', hottest: { atMs: 867_000, bucket: 30 } as never,
    heat: Array.from({ length: 100 }, () => 0.2), counts: '120 listened', resume: 'resumes at 12:10', onHottest: jest.fn(),
  } as never));
  it('the pills are minHeight boxes (the drawn 32 is the least), not fixed heights', () => {
    const r = stage();
    const pills = r.root.find((n) => n.props['testID'] === 'episode-pills' && typeof n.type === 'string');
    const boxes = pills.findAll((n) => typeof n.type === 'string' && Number(flat(n)['paddingHorizontal']) > 0 && (flat(n)['borderRadius'] !== undefined));
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const b of boxes) {
      expect(flat(b)['height']).toBeUndefined();
      expect(Number(flat(b)['minHeight'])).toBeGreaterThanOrEqual(32);
    }
  });
  it('the date pill may shrink (flexShrink) so the "hottest at" pill is not pushed off the right edge', () => {
    const r = stage();
    const date = texts(r).find((x) => said(x).startsWith('TUE 27 OCT'))!;
    let shrinks = false;
    for (let n: ReactTestInstance | null = date; n && n.props['testID'] !== 'episode-pills'; n = n.parent) {
      if (flat(n)['flexShrink'] !== undefined && Number(flat(n)['flexShrink']) > 0) shrinks = true;
      if (/\bflex-shrink\b|\bmin-w-0\b/.test(String(n.props['className'] ?? ''))) shrinks = true;
    }
    expect(shrinks).toBe(true);
  });
  it('twelve million listened prints "12.3M listened · 12.3M comments · 2 clips"', () => {
    expect(countsLine({ listeners: 12_345_678, comments: 12_345_678, clips: 2 })).toBe('12.3M listened · 12.3M comments · 2 clips');
    expect(countsLine({ listeners: 120, comments: 14, clips: 2 })).toBe('120 listened · 14 comments · 2 clips');
  });
});

describe('F10-M1 a Me tile named by one word (F10)', () => {
  it('"Notifications" is one line that shrinks to fit; a two-word name may take two lines', () => {
    const r = render(createElement(MenuTile, { icon: 'notifications-outline', label: 'Notifications', size: 'mosaic' }));
    const t = texts(r).find((x) => said(x) === 'Notifications')!;
    expect(t.props['numberOfLines']).toBe(1);
    expect(t.props['adjustsFontSizeToFit']).toBe(true);
    const two = render(createElement(MenuTile, { icon: 'bookmark-outline', label: 'Saved moments', size: 'mosaic' }));
    expect(Number(texts(two).find((x) => said(x) === 'Saved moments')!.props['numberOfLines'])).toBeGreaterThanOrEqual(2);
  });
});

describe('F10-S1 the Search tab row (F11, W9)', () => {
  const zone = (): ReactTestRenderer => render(createElement(SearchZone, {
    bottom: 6, results: true, tab: 'all', onTab: jest.fn(), since: 'any', onSince: jest.fn(), term: 'Journey', placeholder: 'Search', autoFocus: false,
    onChangeText: jest.fn(), onSubmit: jest.fn(), onClear: jest.fn(), onCancel: jest.fn(), onScan: jest.fn(),
    field: { ref: { current: null }, onLayout: jest.fn(), style: {} }, fadeIn: new Animated.Value(1).interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
  } as never));
  it('the five tabs sit in a horizontal ScrollView, so People and NEW can be reached', () => {
    const r = zone();
    const people = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tab' && n.props['accessibilityLabel'] === 'People')[0]!;
    let scroller: ReactTestInstance | null = people;
    while (scroller && scroller.props['horizontal'] !== true) scroller = scroller.parent;
    expect(scroller).not.toBeNull();
    expect(scroller!.props['showsHorizontalScrollIndicator']).not.toBe(true);
  });
  it('the Published chips are one line each', () => {
    const r = zone();
    const chip = texts(r).find((x) => said(x) === 'Last 6 months')!;
    expect(chip.props['numberOfLines']).toBe(1);
  });
});

describe('F10-N1 one shared count formatter (W1)', () => {
  const compact = (format as unknown as { compactCount?: (n: number) => string }).compactCount;
  it('format.compactCount exists and writes 999, 1.2k, 12.3k, 123k, 12.3M', () => {
    expect(typeof compact).toBe('function');
    const f = compact!;
    expect([0, 1, 999, 1200, 12_345, 123_456, 1_000_000, 12_345_678].map(f)).toEqual(['0', '1', '999', '1.2k', '12.3k', '123k', '1M', '12.3M']);
  });
  it('"listening now" uses it: 12345678 -> "12.3M listening now"; below 2 nobody is named', () => {
    expect(liveLabel(12_345_678)).toBe('12.3M listening now');
    expect(liveLabel(5)).toBe('5 listening now');
    expect(liveLabel(1)).toBeUndefined();
  });
});
