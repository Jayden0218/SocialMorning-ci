// Wave 5b, the heat curve on the Show "Hot moments" card and on the Home moment card: the episode's own curve, the moment lit.
/**
 * Planner, contact/wave-5b (design-pulse2 `show--screen` right phone and `PK.bars`: "the curve with the hot run lit"). The server now adds to each
 * moment `curve: number[]` (100 integers 0..100, the episode's heat normalised to its hottest bucket; apps/api/test/moments.test.ts "curve:").
 * What this proves in Jest (how it looks on a phone is NOT VERIFIED):
 *  - HotMoments (Show) draws 30 bars from `m.curve` (each bar reads bucket floor(k*100/30), height round(min + (h - min) * curve/100)), not from the
 *    peaks it made up before (`peakCurve`), and lights only the bars under the moment (hotBars of start..end over the episode's length).
 *  - MomentCard (Home) draws its 70 bars from `m.curve` when present (the heat read, `useEpisodeHeat`, is the fallback for an older server).
 * RED before phase 2. Break: ignore `curve` in HotMoments (draw `peakCurve`), or divide by 1 instead of 100 (every bar full height).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { HotMoments } from '@/ui/show/HotMoments';
import { MomentCard, CARD_BARS, type Ambient, type CardActions } from '@/ui/discover/MomentCard';
import { SHOW } from '@/ui/show/measures';
import { hotBars } from '@/ui/discover/moments-logic';
import { colour } from '@/design';
import type { Moment } from '@/discover/moments-api';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
// The Home card's own heat read: ones that would be drawn if the card ignored the server's curve.
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: Array.from({ length: 100 }, () => 0.2), durationMs: 1_000_000, comments: 4, mine: [] }) }));

const DURATION = 1_000_000;
/** 1..100 rising: every bucket differs, the last is the hottest. */
const RAMP = Array.from({ length: 100 }, (_, i) => i + 1);
const m = (over: Partial<Moment> & { curve?: number[] }): Moment => ({
  episodeId: 'e1', showTitle: 'Morning Notes', episodeTitle: 'Why mornings matter', feedUrl: 'https://f/x', guid: 'g1', startMs: 872_000, endMs: 890_000,
  reactions: 14, rank: 1, followed: false, comments: [], ...over,
}) as Moment;

const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const barsOf = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => n.props['testID'] === 'curve-bar' && typeof n.type === 'string');
const mounted: ReactTestRenderer[] = [];
beforeEach(() => { setReducedMotionForTest(true); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const expectedHeights = (curve: readonly number[], n: number, height: number, min: number): number[] =>
  Array.from({ length: n }, (_, k) => Math.round(min + (height - min) * (curve[Math.min(curve.length - 1, Math.floor((k * curve.length) / n))]! / 100)));
const litOf = (bars: ReactTestInstance[]): number[] => bars.map((b, k) => (flat(b)['backgroundColor'] === colour.barIdle ? -1 : k)).filter((k) => k >= 0);

describe('Show: the Hot moments card', () => {
  const deck = (cards: Moment[]): ReactTestRenderer => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(HotMoments, { status: 'ready', cards, all: cards, durationOf: () => DURATION, onPlay: jest.fn(), onRetry: jest.fn() })); });
    mounted.push(r);
    return r;
  };
  it('draws 30 bars whose heights are the episode\'s curve (curve / 100), not the made-up peaks', () => {
    const bars = barsOf(deck([m({ curve: RAMP })]));
    expect(SHOW.deckCard.bars).toBe(30);
    expect(bars).toHaveLength(30);
    expect(bars.map((b) => flat(b)['height'])).toEqual(expectedHeights(RAMP, 30, SHOW.deckCard.barsHeight, 2));
  });
  it('lights only the bars under the moment (872.0 s - 890.0 s of 1000 s is bar 26) and leaves the rest idle', () => {
    const bars = barsOf(deck([m({ curve: RAMP })]));
    const [from, to] = hotBars({ startMs: 872_000, endMs: 890_000 }, DURATION, 30)!;
    expect([from, to]).toEqual([26, 26]);
    const lit = litOf(bars);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.every((k) => k >= from && k <= to)).toBe(true);
  });
  it('an older server (no curve) still draws 30 bars, from the peaks', () => {
    const bars = barsOf(deck([m({})]));
    expect(bars).toHaveLength(30);
  });
});

describe('Home: the moment card', () => {
  const GO: Ambient = { focused: true, appActive: true, reduceMotion: false, web: false };
  const noop = jest.fn();
  const actions = (): CardActions => ({ playFull: noop, toggleSound: noop, comments: noop, react: (async () => true) as never, share: noop });
  const home = (item: Moment): ReactTestRenderer => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(MomentCard, { item, width: 390, height: 700, top: 47, active: false, near: true, ambient: GO, soundOn: false, actions: actions() })); });
    mounted.push(r);
    return r;
  };
  it('draws its 70 bars from the moment\'s curve when it has one (the heat read says 0.2 everywhere and loses)', () => {
    const bars = barsOf(home(m({ curve: RAMP })));
    expect(bars).toHaveLength(CARD_BARS);
    expect(bars.map((b) => flat(b)['height'])).toEqual(expectedHeights(RAMP, CARD_BARS, 24, 2));
  });
  it('without a curve (an older server) it keeps drawing the heat read', () => {
    const bars = barsOf(home(m({})));
    expect(bars.map((b) => flat(b)['height'])).toEqual(expectedHeights(Array.from({ length: 100 }, () => 20), CARD_BARS, 24, 2));
  });
});
