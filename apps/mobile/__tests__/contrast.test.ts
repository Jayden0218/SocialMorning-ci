/**
 * quickstart A1 / guard G2: every token pair clears its WCAG floor. The numbers are the
 * ones research R1 computed before the palette was adopted — if a token changes and the
 * contrast drops, this is what says so.
 */
import { colour } from '../src/design/tokens';
import { BODY_MIN, LARGE_MIN, PAIRS, PAIRS_DARK, WAIVED, contrastRatio, failures, relativeLuminance } from '../src/design/contrast';
import { colour as lightColour, colourDark } from '../src/design/tokens';
import { paletteFor } from '../src/ui/useColours';

const round = (n: number) => Math.round(n * 100) / 100;

it('the measured ratios are the ones the palette was chosen for', () => {
  // White theme, yellow brand, 2026-09-27.
  expect(round(contrastRatio(colour.text, colour.background))).toBe(18.85);
  expect(round(contrastRatio(colour.muted, colour.background))).toBe(6.05);
  expect(round(contrastRatio(colour.accent, colour.background))).toBe(5.93);
  // The heat bars are 50 % black: 3.98, over the 3:1 information floor.
  expect(round(contrastRatio(colour.bar, colour.background))).toBe(3.98);
});

it('G2: every declared pair clears its floor', () => {
  expect(failures()).toEqual([]);
  for (const p of PAIRS) expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(p.min);
});

it('the colours this app dropped would have failed — that is why they are gone', () => {
  // M7's dark-theme red fails the body floor on white.
  expect(contrastRatio('#fc3c44', colour.background)).toBeLessThan(BODY_MIN); // 3.58
  // The brand yellow as text on white fails even the large floor — the reason it is a
  // fill only, and links take the deep amber `accent`.
  expect(contrastRatio(colour.primary, colour.background)).toBeLessThan(LARGE_MIN); // 1.60
  // 40 % black bars fail the information floor on white — the reason ours are 50 %.
  expect(contrastRatio('rgba(0,0,0,0.40)', colour.background)).toBeLessThan(LARGE_MIN); // 2.85
});

it('handles #rgb, #rrggbb and rgba() composited over its background', () => {
  expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
  // 5.28, not the 5.24 the throwaway python check gave: that truncated the composite
  // to 127 where the real value is 127.5. The 40 % bar is unaffected (102.0 exactly).
  expect(round(contrastRatio('rgba(255,255,255,0.50)', '#000000'))).toBe(5.28);
  expect(round(contrastRatio('rgba(255,255,255,1)', '#000000'))).toBe(21);
  expect(() => relativeLuminance('not-a-colour')).toThrow();
  expect(BODY_MIN).toBe(4.5);
});

it('the owner\'s waiver is exactly one pair, pinned at its measured ratio', () => {
  // White on the icon yellow: 1.60. If a token change moves this, the test says so.
  expect(WAIVED).toHaveLength(1);
  expect(round(contrastRatio(WAIVED[0]!.fg, WAIVED[0]!.bg))).toBe(1.6);
  expect(WAIVED[0]!.fg).toBe(colour.onPrimary);
  expect(WAIVED[0]!.bg).toBe(colour.primary);
});


/**
 * M10b US4 — the dark palette. Guard G-D1: the break that turns this red is lightening one
 * dark text token (e.g. `colourDark.muted` to '#55585e') in `src/design/tokens.ts`.
 */
it('G-D1: every dark pair clears its floor', () => {
  expect(failures(PAIRS_DARK)).toEqual([]);
  expect(PAIRS_DARK.length).toBe(10); // M12: + play glyph on its tint, player text on the veil
});

it('the dark palette has exactly the light one\'s keys (M9 writes CSS variables from both)', () => {
  expect(Object.keys(colourDark).sort()).toEqual(Object.keys(lightColour).sort());
  for (const v of Object.values(colourDark)) expect(typeof v).toBe('string');
});

it('Appearance: the setting wins; System follows the phone', () => {
  expect(paletteFor('dark', 'light')).toBe(colourDark);
  expect(paletteFor('light', 'dark')).toBe(lightColour);
  expect(paletteFor('system', 'dark')).toBe(colourDark);
  expect(paletteFor('system', 'light')).toBe(lightColour);
  expect(paletteFor('system', null)).toBe(lightColour);
});
