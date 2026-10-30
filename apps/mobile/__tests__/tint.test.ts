// Guard G-M21-5: a cover tint never leaves text, muted or any accent below 4.5:1 on the page.
/**
 * M21 US4/US5 (research R6): the episode and show pages are tinted from the cover, laid over
 * the paper at the strongest of 30 / 20 / 12 / 8 % where every word colour still reads. Twenty
 * fixed covers — black, navy, red, yellow, greys, white and brand-ish colours — each checked
 * against every accent theme at once (the default) and against each theme alone (what a screen
 * passes).
 *
 * The break that turns it red: in `src/design/gradient.ts` `tintFor`, always return the 0.3 mix
 * (`return mixOverPage(hex, 0.3) ?? colour.background`).
 */
import { ACCENTS, BODY_MIN, colour, contrastRatio } from '@/design';
import { ALL_ACCENTS, mixOverPage, tintFor, wordsReadOn } from '@/design/gradient';

const COVERS = [
  '#000000', '#1e3a8a', '#c0392b', '#f4d03f', '#808080', '#7f7f7f', '#333333', '#cccccc', '#ffffff', '#fcc522',
  '#1d4ed8', '#0f766e', '#e11d48', '#6d28d9', '#15803d', '#a21caf', '#8a5a00', '#2e86c1', '#f39c12', '#16a085',
];

const reads = (bg: string, accents: readonly string[]) =>
  [colour.text, colour.muted, colour.accent, ...accents].every((fg) => contrastRatio(fg, bg) >= BODY_MIN);

it('G-M21-5: every cover, against every accent theme at once, gives a page every word reads on', () => {
  expect(COVERS).toHaveLength(20);
  for (const c of COVERS) {
    const page = tintFor(c);
    expect({ c, page, reads: reads(page, ALL_ACCENTS) }).toEqual({ c, page, reads: true });
  }
});

it('G-M21-5: and against each accent theme alone (what a screen passes)', () => {
  for (const theme of Object.values(ACCENTS)) {
    for (const c of COVERS) {
      const page = tintFor(c, [theme.light.accent]);
      expect({ c, theme: theme.label, reads: reads(page, [theme.light.accent]) }).toEqual({ c, theme: theme.label, reads: true });
    }
  }
});

it('the strongest mix that reads is taken: navy stops at 12 % with the brand accent (accent is 3.92 at 20 %)', () => {
  expect(tintFor('#1e3a8a', [colour.accent])).toBe(mixOverPage('#1e3a8a', 0.12));
  expect(wordsReadOn(mixOverPage('#1e3a8a', 0.2)!, [colour.accent])).toBe(false);
  // A light cover is tinted, not left plain.
  expect(tintFor('#f4d03f', [colour.accent])).not.toBe(colour.background);
});

it('no tint, or one that is not a six-digit colour, gives the paper page', () => {
  expect(tintFor(null)).toBe(colour.background);
  expect(tintFor(undefined)).toBe(colour.background);
  expect(tintFor('')).toBe(colour.background);
  expect(tintFor('red')).toBe(colour.background);
  expect(tintFor('#abc')).toBe(colour.background);
});
