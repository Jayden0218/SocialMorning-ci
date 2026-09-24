/**
 * quickstart A1 / guard G2: every token pair clears its WCAG floor. The numbers are the
 * ones research R1 computed before the palette was adopted — if a token changes and the
 * contrast drops, this is what says so.
 */
import { colour } from '../src/design/tokens';
import { BODY_MIN, LARGE_MIN, PAIRS, contrastRatio, failures, relativeLuminance } from '../src/design/contrast';

const round = (n: number) => Math.round(n * 100) / 100;

it('the measured ratios are the ones the palette was chosen for', () => {
  expect(round(contrastRatio(colour.text, colour.background))).toBe(21);
  expect(round(contrastRatio(colour.muted, colour.background))).toBe(8.27);
  expect(round(contrastRatio(colour.accent, colour.background))).toBe(5.87);
  // The heat bars are 40 % white: 3.66, just over the 3:1 information floor.
  expect(round(contrastRatio(colour.bar, colour.background))).toBe(3.66);
});

it('G2: every declared pair clears its floor', () => {
  expect(failures()).toEqual([]);
  for (const p of PAIRS) expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(p.min);
});

it('the colours this app dropped would have failed — that is why they are gone', () => {
  expect(contrastRatio('#0645ad', colour.background)).toBeLessThan(LARGE_MIN); // old link, 2.46
  expect(contrastRatio('#b00020', colour.background)).toBeLessThan(LARGE_MIN); // old danger, 2.87
  // The reference's own 30 % bars fail the information floor — the reason ours are 40 %.
  expect(contrastRatio('rgba(255,255,255,0.30)', colour.background)).toBeLessThan(LARGE_MIN);
});

it('handles #rgb, #rrggbb and rgba() composited over its background', () => {
  expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
  expect(round(contrastRatio('rgba(255,255,255,0.50)', '#000000'))).toBe(5.24);
  expect(round(contrastRatio('rgba(255,255,255,1)', '#000000'))).toBe(21);
  expect(() => relativeLuminance('not-a-colour')).toThrow();
  expect(BODY_MIN).toBe(4.5);
});
