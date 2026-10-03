/**
 * quickstart A1 / guards G2 and G-E1 (M17, FR-005): every token pair clears its WCAG floor,
 * and nothing ships under it. The numbers are the ones research R2 measured on 2026-10-03
 * before the Editorial palette was adopted — if a token changes and the contrast drops, this
 * is what says so.
 *
 * G-E1, the break that turns it red: set `onPrimary` back to '#ffffff' in src/design/tokens.ts
 * (white on the icon yellow, 1.60 — the waiver constitution v3.0.0 ended).
 */
import { colour, ACCENTS } from '@/design/tokens';
import { ACCENT_PAIRS, BODY_MIN, LARGE_MIN, PAIRS, WAIVED, contrastRatio, failures, relativeLuminance } from '@/design/contrast';
import { withAccent } from '@/design/accent';

const round = (n: number) => Math.round(n * 100) / 100;

it('the measured ratios are the ones the Editorial palette was chosen for', () => {
  expect(round(contrastRatio(colour.text, colour.background))).toBe(17.47);
  expect(round(contrastRatio(colour.muted, colour.background))).toBe(6.96);
  expect(round(contrastRatio(colour.accent, colour.background))).toBe(5.59);
  expect(round(contrastRatio(colour.onPrimary, colour.primary))).toBe(11.8);
  // The heat bars are 50 % black: 3.93 on the warm page, over the 3:1 information floor.
  expect(round(contrastRatio(colour.bar, colour.background))).toBe(3.93);
});

it('G2: every declared pair clears its floor', () => {
  expect(failures()).toEqual([]);
  for (const p of PAIRS) expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(p.min);
});

it('G-E1: no waiver — words on the yellow are dark, and nothing is shipped under its floor', () => {
  expect(WAIVED).toEqual([]);
  expect(PAIRS.some((p) => p.fg === colour.onPrimary && p.bg === colour.primary)).toBe(true);
  expect(contrastRatio(colour.onPrimary, colour.primary)).toBeGreaterThanOrEqual(BODY_MIN);
});

it('the colours this app avoids would have failed — that is why they are not used', () => {
  // The brand yellow as text on the page fails even the large floor: a fill only.
  expect(contrastRatio(colour.primary, colour.background)).toBeLessThan(LARGE_MIN);
  // White words on the yellow: the old waiver, 1.60.
  expect(round(contrastRatio('#ffffff', colour.primary))).toBe(1.6);
  // 40 % black bars fail the information floor on the page — the reason ours are 50 %.
  expect(contrastRatio('rgba(0,0,0,0.40)', colour.background)).toBeLessThan(LARGE_MIN);
});

it('handles #rgb, #rrggbb and rgba() composited over its background', () => {
  expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
  expect(round(contrastRatio('rgba(255,255,255,0.50)', '#000000'))).toBe(5.28);
  expect(round(contrastRatio('rgba(255,255,255,1)', '#000000'))).toBe(21);
  expect(() => relativeLuminance('not-a-colour')).toThrow();
  expect(BODY_MIN).toBe(4.5);
});

// M12 guard G-A1b (FR-108): every accent theme clears its floors on the M17 page —
// 6 themes × 4 pairs. The break: set a theme's accent to a 3:1 colour.
it('G-A1b: every accent theme passes its contrast floors', () => {
  expect(Object.keys(ACCENTS).length - 1).toBeGreaterThanOrEqual(6);
  expect(ACCENT_PAIRS).toHaveLength((Object.keys(ACCENTS).length - 1) * 4);
  expect(failures(ACCENT_PAIRS)).toEqual([]);
});

it('an accent swaps only its four tokens; sunrise is the brand palette', () => {
  expect(withAccent(colour, 'sunrise')).toBe(colour);
  const teal = withAccent(colour, 'teal');
  expect(teal.accent).toBe(ACCENTS.teal.light.accent);
  expect(teal.text).toBe(colour.text);
  expect(teal.background).toBe(colour.background);
});
