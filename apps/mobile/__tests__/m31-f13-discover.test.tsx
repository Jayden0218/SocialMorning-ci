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
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useWindowDimensions } from 'react-native';
import { RisingComments } from '@/ui/discover/RisingComments';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1.3 })) }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };
const setWindow = (width: number, height = 844): void => { (useWindowDimensions as unknown as jest.Mock).mockReturnValue({ width, height, scale: 3, fontScale: 1.3 }); };


// 039 verifier fix: F13-1 (the HOT NOW tile's font-scale guards) went with the DiscoverMosaic component, which no page draws.

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
