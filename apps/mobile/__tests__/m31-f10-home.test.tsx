// Home at 200 % text and with a huge count: the hot tag, the card title and the mosaic tiles grow instead of clipping; counts print short.
/**
 * M31 F10 (FR-031; specs/033-m31-redesign/contact/fontscale2/README.md F6 F7, widths/README.md W1 W3). Written BEFORE the fix: red where noted.
 *   F6  Moments card: the red "HOT 14:32 - 15:10" label is a bar that cannot be a fixed `height` (its text was cut in half): `minHeight` instead;
 *       the title takes two lines; the rail words ("Share") are one line.
 *   F7  Discover mosaic: the pick, Hot now and the shortcut tiles hold text, so their sizes are `minHeight` (the drawn size is the least), not `height`.
 *   W1  a count of 12 345 678 prints "12.3M" (the Moments rail printed "12346k"; the pick tile "12345678 listened").
 * The Moments card's and the mosaic's old tests read `height` (m31-l7-drawing "hot tag", m31-discover-mosaic "the sizes"): phase 2 changes them to `minHeight`.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MomentCard, type Ambient, type CardActions } from '@/ui/discover/MomentCard';
import { DiscoverMosaic, HOT_HEIGHT, MOSAIC, PICK_HEIGHT, type MosaicActions, type ShortcutTile } from '@/ui/discover/DiscoverMosaic';
import { shortCount } from '@/ui/discover/moments-logic';
import { bars } from '@/design';
import type { Moment } from '@/discover/moments-api';
import type { PickWithFaces } from '@/discover/explore-api';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 2 })) }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));

const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const mounted: ReactTestRenderer[] = [];
beforeEach(() => { setReducedMotionForTest(true); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const said = (n: ReactTestInstance): string => [n.props['children']].flat(5).map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : '')).join('');
const texts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((n) => String(n.type) === 'Text');

const GO: Ambient = { focused: true, appActive: true, reduceMotion: false, web: false };
const MOMENT: Moment = { episodeId: 'e1', showTitle: 'Morning Notes', episodeTitle: 'Why mornings matter, and the long way round to the answer', startMs: 872_000, endMs: 910_000, reactions: 12_345_678, rank: 1, followed: true, comments: [] };
const noop = jest.fn();
const actions = (): CardActions => ({ playFull: noop, toggleSound: noop, comments: noop, react: (async () => true) as never, share: noop });
function card(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(MomentCard, { item: MOMENT, width: 390, height: 700, top: 47, active: true, near: true, ambient: GO, soundOn: false, actions: actions() })); });
  mounted.push(r);
  return r;
}

describe('F10-H1 the Moments card (F6, W1)', () => {
  it('the hot tag is at least the drawn height, never a fixed one', () => {
    const tag = card().root.findAll((n) => n.props['testID'] === 'hot-tag' && typeof n.type === 'string')[0]!;
    expect(flat(tag)['height']).toBeUndefined();
    expect(Number(flat(tag)['minHeight'])).toBeGreaterThanOrEqual(bars.stamp);
  });
  it('the title takes two lines, the show line one, the rail words one', () => {
    const r = card();
    const title = texts(r).find((t) => said(t).startsWith('Why mornings matter'))!;
    expect(Number(title.props['numberOfLines'])).toBeLessThanOrEqual(2);
    const show = texts(r).find((t) => said(t).startsWith('Morning Notes'))!;
    expect(show.props['numberOfLines']).toBe(1);
    const share = texts(r).find((t) => said(t) === 'Share')!;
    expect(share.props['numberOfLines']).toBe(1);
  });
  it('twelve million reactions print "12.3M", on the rail and in the show line', () => {
    expect(shortCount(12_345_678)).toBe('12.3M');
    expect(shortCount(2400)).toBe('2.4k');
    expect(shortCount(999_999)).not.toBe('1000k');
    const w = texts(card()).map(said);
    expect(w).toContain('12.3M');
    expect(w).toContain('Morning Notes · 12.3M reacted here');
  });
});

const PICK = { kind: 'pick', key: 'k', why: 'Short, warm, and good with coffee.', episode: { id: 'e1', feedUrl: 'https://f', guid: 'g', title: 'Why mornings matter', showTitle: 'Morning Notes', enclosureUrl: 'https://a.mp3' } } as unknown as PickWithFaces;
const HOT: Moment = { ...MOMENT, episodeId: 'h1', showTitle: 'S', episodeTitle: 'Hot ep', reactions: 41, comments: [] };
const tiles = (n: number): ShortcutTile[] => Array.from({ length: n }, (_, i) => ({ label: `T${i}`, icon: 'grid-outline', onPress: jest.fn() }));
const acts = (): MosaicActions => ({ onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onPast: jest.fn(), onHot: jest.fn() });
function mosaic(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(DiscoverMosaic, { pick: PICK, date: '2026-10-27', stats: { listeners: 12_345_678, comments: 14 }, hot: HOT, tiles: tiles(8), offline: false, actions: acts(), onSearch: jest.fn() } as never)); });
  mounted.push(r);
  return r;
}
const tile = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const is = (n: ReactTestInstance | null): boolean => n !== null && n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function';
  return r.root.findAll((n) => is(n) && !is(n.parent))[0]!;
};

describe('F10-H2 the Discover mosaic (F7, W1)', () => {
  it('the shortcut, Hot now and pick tiles are minHeight boxes (the drawn size is the least), not fixed heights', () => {
    const r = mosaic();
    const hot = tile(r, 'Hot now: play Hot ep from 14:32. 41 reacting');
    const short = tile(r, 'T2');
    expect([flat(hot)['height'], flat(short)['height']]).toEqual([undefined, undefined]);
    expect(Number(flat(hot)['minHeight'])).toBe(HOT_HEIGHT);
    expect(Number(flat(short)['minHeight'])).toBe(MOSAIC.row);
    const pick = r.root.findAll((n) => typeof n.type === 'string' && Number(flat(n)['minHeight']) === PICK_HEIGHT)[0];
    expect(pick).toBeTruthy();
    expect(r.root.findAll((n) => typeof n.type === 'string' && flat(n)['height'] === PICK_HEIGHT)).toHaveLength(0);
  });
  it('the pick tile prints "12.3M listened", not 12345678', () => {
    const w = texts(mosaic()).map(said).join(' | ');
    expect(w).toContain('12.3M listened');
    expect(w).not.toContain('12345678');
  });
});
