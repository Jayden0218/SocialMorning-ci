// Tests F13 (phase 1, red first): the HOT NOW number cannot grow past its tile, and the Moments comments leave the action rail free.
/**
 * M31 F13 (specs/033-m31-redesign/contact/fontscale2/README.md F7, contact/widths/README.md W3). Written BEFORE the fix.
 *  - F7 at the 1.3 cap: the HOT NOW time "14:32" (Unbounded 34 in a 168 wide 1 x 2 tile) wraps to "14:3 / 2". A number in a fixed tile does not need to
 *    grow with the system font: every Text of the time carries `maxFontSizeMultiplier` 1, it is one line that shrinks to fit (>= 0.5), and the
 *    "N reacting" line is one line. Break: `maxFontSizeMultiplier` back to the Type default (1.3) - red.
 *  - W3: at 320 wide the rising comments (pill max 240) run under the 56 wide action rail (16 from the right edge). Their max width must be
 *    at most window - 48 (rail) - 16 - 16 - 14. Break: `PILL_MAX` back to a flat 240 - red at 320 (430 holds already).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { useWindowDimensions } from 'react-native';
import { HotNowTile } from '@/ui/discover/DiscoverMosaic';
import { RisingComments } from '@/ui/discover/RisingComments';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import type { Moment } from '@/discover/moments-api';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1.3 })) }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };
const setWindow = (width: number, height = 844): void => { (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width, height, scale: 3, fontScale: 1.3 }); };
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const texts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((x) => String(x.type) === 'Text');

const HOT: Moment = { episodeId: 'h1', showTitle: 'S', episodeTitle: 'Hot ep', startMs: 872_000, endMs: 910_000, reactions: 41, rank: 1, followed: false, comments: [{ id: 'c', author: 'Rui', text: 'the part I replay', likes: 1 }] };

describe('F13-1 HOT NOW tile (fontscale2 F7)', () => {
  it('every Text of the time carries maxFontSizeMultiplier 1 (a number in a fixed tile does not grow), one line, shrinks to fit but not below 0.5', () => {
    const r = render(createElement(HotNowTile, { moment: HOT, onPress: jest.fn() }));
    const time = r.root.findAll((n) => n.props['testID'] === 'hot-now-time' && String(n.type) === 'Text')[0]!;
    expect(time.props['maxFontSizeMultiplier']).toBe(1);
    expect(time.props['numberOfLines']).toBe(1);
    expect(time.props['adjustsFontSizeToFit']).toBe(true);
    expect(time.props['minimumFontScale']).toBeGreaterThanOrEqual(0.5);
    // the nested one-character Texts (the gradient steps) must not re-enable the font scale
    const inner = texts(r).filter((t) => t !== time && ['1', '4', ':', '3', '2'].includes(say(t.props['children'])));
    expect(inner.length).toBeGreaterThanOrEqual(5);
    for (const t of inner) expect(t.props['maxFontSizeMultiplier']).toBe(1);
  });

  it('"41 reacting" is one line', () => {
    const r = render(createElement(HotNowTile, { moment: HOT, onPress: jest.fn() }));
    const line = texts(r).find((t) => say(t.props['children']) === '41 reacting')!;
    expect(line).toBeDefined();
    expect(line.props['numberOfLines']).toBe(1);
  });
});

describe('F13-4 rising comments leave the action rail free (widths W3)', () => {
  const comments = [
    { id: '1', author: 'Rui the Very Long Named Listener', text: 'the part I replay every morning', likes: 3 },
    { id: '2', author: 'Ana', text: 'second', likes: 1 },
    { id: '3', author: 'Jo', text: 'third', likes: 0 },
  ];
  const RAIL = 48;
  const maxWidths = (r: ReactTestRenderer): number[] =>
    r.root.findAll((n) => typeof n.type === 'string' && typeof (StyleSheet.flatten(n.props['style']) as Record<string, unknown> | undefined)?.['maxWidth'] === 'number')
      .map((n) => (StyleSheet.flatten(n.props['style']) as Record<string, number>)['maxWidth']!);
  it.each([320, 430])('at %i wide every pill is at most window - 48 - 16 - 16 - 14 wide', (width) => {
    setWindow(width, 568);
    const r = render(createElement(RisingComments, { comments, run: false, top: 120 }));
    const widths = maxWidths(r);
    expect(widths).toHaveLength(3);
    for (const w of widths) expect(w).toBeLessThanOrEqual(width - RAIL - 16 - 16 - 14);
  });
});
