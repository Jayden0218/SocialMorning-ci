// Checks that every colour pair is readable enough under WCAG contrast rules.
/**
 * quickstart A1 / guards G2 and G-E1 (M17 FR-005, redone for Pulse in M31 T021): every token pair
 * clears its WCAG floor, and nothing ships under it. The numbers are the ones measured on
 * 2026-10-27 before the Pulse palette was adopted (they match the table in
 * `design-pulse/index.html` §System) — if a token changes and the contrast drops, this is what
 * says so.
 *
 * G-E1, the break that turns it red: set `onPrimary` (or `void`'s words on hot) to '#ffffff'
 * in src/design/tokens.ts (white on hot, 3.21 — the pair the constitution forbids).
 */
import { colour, ACCENTS } from '@/design/tokens';
import { ACCENT_PAIRS, BODY_MIN, LARGE_MIN, PAIRS, WAIVED, contrastRatio, failures, relativeLuminance } from '@/design/contrast';
import { withAccent } from '@/design/accent';

const round = (n: number) => Math.round(n * 100) / 100;

it('the measured ratios are the ones the Pulse palette was chosen for', () => {
  expect(round(contrastRatio(colour.text, colour.void))).toBe(18.11);
  expect(round(contrastRatio(colour.text, colour.raise2))).toBe(15.48);
  expect(round(contrastRatio(colour.text2, colour.void))).toBe(7.95);
  expect(round(contrastRatio(colour.text2, colour.raise2))).toBe(6.79);
  expect(round(contrastRatio(colour.text3, colour.void))).toBe(5.81);
  expect(round(contrastRatio(colour.text3, colour.raise2))).toBe(4.96);
  expect(round(contrastRatio(colour.hotText, colour.void))).toBe(8.46);
  expect(round(contrastRatio(colour.hotText, colour.raise2))).toBe(7.23);
  expect(round(contrastRatio(colour.void, colour.hot))).toBe(6.3);
  expect(round(contrastRatio(colour.idle, colour.void))).toBe(4.51);
  expect(round(contrastRatio(colour.violet, colour.void))).toBe(3.78);
  // The unplayed heat bars are white at 40 %: 3.73 on the page, over the 3:1 information floor
  // (the drawings' 18–28 % are 1.6–2.4 and fail it).
  expect(round(contrastRatio(colour.barIdle, colour.void))).toBe(3.73);
});

it('G2: every declared pair clears its floor', () => {
  expect(failures()).toEqual([]);
  for (const p of PAIRS) expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(p.min);
});

it('G-E1: no waiver — words on hot are void, and nothing is shipped under its floor', () => {
  expect(WAIVED).toEqual([]);
  expect(PAIRS.some((p) => p.fg === colour.onPrimary && p.bg === colour.primary)).toBe(true);
  expect(PAIRS.some((p) => p.fg === colour.void && p.bg === colour.hot)).toBe(true);
  expect(contrastRatio(colour.onPrimary, colour.primary)).toBeGreaterThanOrEqual(BODY_MIN);
  expect(colour.onPrimary).toBe(colour.void);
});

it('the colours this app avoids would have failed — that is why they are not used', () => {
  // White words on hot: 3.21, under the body floor — so words on hot are void.
  expect(round(contrastRatio('#ffffff', colour.hot))).toBe(3.21);
  expect(contrastRatio('#ffffff', colour.hot)).toBeLessThan(BODY_MIN);
  // Violet is never for words: 3.78 on the page, under the body floor.
  expect(contrastRatio(colour.violet, colour.void)).toBeLessThan(BODY_MIN);
  // The drawings' 28 % white bars fail the information floor on the page — the reason ours are 40 %.
  expect(contrastRatio('rgba(255,255,255,0.28)', colour.void)).toBeLessThan(LARGE_MIN);
  expect(contrastRatio('rgba(255,255,255,0.18)', colour.void)).toBeLessThan(LARGE_MIN);
});

it('handles #rgb, #rrggbb and rgba() composited over its background', () => {
  expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
  expect(round(contrastRatio('rgba(255,255,255,0.50)', '#000000'))).toBe(5.28);
  expect(round(contrastRatio('rgba(255,255,255,1)', '#000000'))).toBe(21);
  expect(() => relativeLuminance('not-a-colour')).toThrow();
  expect(BODY_MIN).toBe(4.5);
});

// M12 guard G-A1b (FR-108): every accent theme clears its floors on the Pulse surfaces —
// 6 themes × 6 pairs. The break: set a theme's accent to a 3:1 colour.
it('G-A1b: every accent theme passes its contrast floors', () => {
  expect(Object.keys(ACCENTS).length - 1).toBeGreaterThanOrEqual(6);
  expect(ACCENT_PAIRS).toHaveLength((Object.keys(ACCENTS).length - 1) * 6);
  expect(failures(ACCENT_PAIRS)).toEqual([]);
});

it('an accent swaps four tokens and the Pulse hot colours that follow them; sunrise is the brand palette', () => {
  expect(withAccent(colour, 'sunrise')).toBe(colour);
  expect(colour.primary).toBe(colour.hot);
  expect(colour.accent).toBe(colour.hotText);
  expect(colour.accentTint).toBe(colour.hotSoft);
  const teal = withAccent(colour, 'teal');
  expect(teal.accent).toBe(ACCENTS.teal.light.accent);
  expect(teal.hot).toBe(ACCENTS.teal.light.primary);
  expect(teal.hotText).toBe(ACCENTS.teal.light.accent);
  expect(teal.text).toBe(colour.text);
  expect(teal.background).toBe(colour.background);
  expect(teal.void).toBe(colour.void);
});

it('the older role names are aliases of the Pulse values (until the last wave)', () => {
  expect(colour.background).toBe(colour.void);
  expect(colour.surface).toBe(colour.raise);
  expect(colour.border).toBe(colour.line);
  expect(colour.muted).toBe(colour.text2);
  expect(colour.segment).toBe(colour.raise2);
});
