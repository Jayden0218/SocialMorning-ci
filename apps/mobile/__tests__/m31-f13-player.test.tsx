// Tests F13 (phase 1, red first): the Player ring clears the title on a short window; the Playback sheet fits a short window; the hot pill keeps its time.
/**
 * M31 F13 (widths W2, W10; fontscale2 F1). Written BEFORE the fix.
 *  - W2: at 320 x 568 the ring keeps >= 200 (`ringSize` floor) and the 3-line title is printed over the ring and the clock bubble. The ring must shrink
 *    until ringTop + ring + 8 <= the title block's top (window - titleBottom - title height: 2 lines of the 26 title on a 33 line = 66, the show line 18, a 12 gap).
 *    390 x 844 (the drawing) must keep holding. Break: the `Math.max(200, ...)` floor back - red at 320 x 568.
 *  - W10: the Playback sheet at 320 x 568: its body scrolls (a ScrollView), Done is pinned below it, and the sheet as a whole (grabber 8 + 5 + 14, the body, Done + 14, the bottom inset + 12)
 *    stays under the status bar + 20. Break: `screen.height * 0.8` back - red.
 *  - F1: the pill's words shrink to fit (>= 0.7) instead of ending in an ellipsis that eats the time.
 */
import { createElement } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { playerLayout } from '@/ui/player/measures';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1.3 })) }));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => ({
    settings: { get: () => 'light', set: () => undefined },
    feeds: { getEpisode: () => ({ id: 'e1', feedUrl: 'https://f/x.xml', title: 'Ep' }) },
    speed: { get: () => undefined, set: () => undefined, clear: () => undefined },
  }),
}));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { social: () => Promise.resolve({ status: 404 }) }, useEpisodeSocial: () => ({ cached: undefined }) }) }));
jest.mock('@/ui/player/hot', () => ({
  hotMoments: () => [{ fromMs: 60_000, toMs: 70_000 }],
  hotPillText: () => 'next hot moment in 0:57',
  nextHot: () => ({ fromMs: 60_000, toMs: 70_000 }),
}));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({
    seek: () => undefined, subscribe: () => () => undefined, rate: () => 1.2, defaultRate: () => 1.2, setRate: () => undefined, setDefaultRate: () => undefined,
    sleepTimer: () => ({ endOfEpisode: false }), sleepRemainingMs: () => undefined, setSleepTimer: () => undefined, setSleepEndOfEpisode: () => undefined,
  }),
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel({ kind: 'playing', episodeId: 'e1', positionMs: 3_000, lastSavedMs: 0, durationMs: 600_000 }),
}));

import { SettingsPanel } from '@/ui/player/SettingsPanel';
import { PlayerTopBar } from '@/ui/player/PlayerTopBar';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const setWindow = (width: number, height: number): void => { (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width, height, scale: 3, fontScale: 1.3 }); };
const render = (el: React.ReactElement, insets = { top: 50, bottom: 34, left: 0, right: 0 }): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: insets }, el)); });
  mounted.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;

describe('F13-3 the Player ring clears the title block (widths W2)', () => {
  const TITLE_HEIGHT = 66 + 18 + 12; // two lines of the 26 / 33 title, the show line, the gap
  it.each([[320, 568], [390, 844]])('at %i x %i: ringTop + ring + 8 <= the title block top', (width, height) => {
    const L = playerLayout({ width, height }, { top: 50, bottom: 34 });
    const titleTop = height - L.titleBottom - TITLE_HEIGHT;
    expect(L.ringTop + L.ring + 8).toBeLessThanOrEqual(titleTop);
    expect(L.ring).toBeGreaterThanOrEqual(96); // still a ring, not a dot
  });
  it('the time bubble stays inside the shrunk ring at 320 x 568', () => {
    const L = playerLayout({ width: 320, height: 568 }, { top: 50, bottom: 34 });
    expect(L.bubbleTop).toBeGreaterThanOrEqual(L.ringTop);
    expect(L.bubbleTop + 24).toBeLessThanOrEqual(L.ringTop + L.ring);
  });
});

describe('F13-5 the Playback sheet at 320 x 568 (widths W10)', () => {
  const props = { open: true, onClose: () => undefined, looping: false, onLoop: () => undefined, skipSilence: false, onSkipSilence: () => undefined };
  it('the body is a ScrollView holding "More settings", Done is pinned below it, and the whole sheet fits under the status bar + 20', () => {
    setWindow(320, 568);
    const r = render(createElement(SettingsPanel, props));
    const scrolls = r.root.findAll((n) => typeof n.type === 'string' && n.props['horizontal'] !== true && flat(n)['maxHeight'] !== undefined && /RCTScrollView|ScrollView/.test(String(n.type)));
    const body = scrolls.length > 0 ? scrolls : r.root.findAll((n) => String(n.type).includes('ScrollView') && flat(n)['maxHeight'] !== undefined);
    expect(body.length).toBeGreaterThan(0);
    const sheetMax = Number(flat(body[0]!)['maxHeight']);
    expect(sheetMax).toBeLessThanOrEqual(568 - 50 - 20);
    // chrome around the body: 8 top padding + 5 grabber + 14 gap above, the home inset (34) + 12 below
    // the pinned Done row (48) and its 14 gap sit below the body, so they count against the same budget
    expect(sheetMax + 27 + (34 + 12) + (48 + 14)).toBeLessThanOrEqual(568 - 50 - 20);
    const inside = (label: string): boolean => body[0]!.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function').length > 0;
    // "More settings" scrolls inside the body; Done is pinned below it, outside the scroll, so it is always on screen
    expect(inside('More settings: loop, audio output, skip silence, voice boost')).toBe(true);
    expect(inside('Close')).toBe(false);
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Close' && typeof n.props['onPress'] === 'function').length).toBeGreaterThan(0);
  });
});

describe('F13-8 the hot pill keeps its time (fontscale2 F1)', () => {
  it('the pill text shrinks to fit (adjustsFontSizeToFit, minimumFontScale 0.7) instead of ending in an ellipsis', () => {
    setWindow(390, 844);
    const r = render(createElement(PlayerTopBar, { episodeId: 'e1', onClose: jest.fn(), onMore: jest.fn() }));
    const pill = r.root.findAll((n) => String(n.type) === 'Text' && String(n.props['children'] ?? '').includes('next hot moment'))[0]!;
    expect(pill).toBeDefined();
    expect(pill.props['numberOfLines']).toBe(1);
    expect(pill.props['adjustsFontSizeToFit']).toBe(true);
    expect(pill.props['minimumFontScale']).toBeLessThanOrEqual(0.7);
    expect(pill.props['minimumFontScale']).toBeGreaterThanOrEqual(0.5);
  });
});
