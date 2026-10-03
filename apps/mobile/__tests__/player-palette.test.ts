// Tests that a show's theme colour tints the player only while text stays readable.
/**
 * M17 (constitution v3.0.0, `Player-B`): the player uses the light Editorial palette, and a
 * show's Studio theme colour tints its top — only as far as the text and secondary text still
 * read on it (4.5:1 each). Replaces the M12 always-dark player test.
 *
 * The break that turns it red: drop the `readableOnPage` check from `playerWash` (a full-strength
 * deep colour comes back as a wash the words cannot be read on).
 */
import { BODY_MIN, colour, contrastRatio } from '@/design';
import { playerWash, readableOnPage, tintOverPage } from '@/ui/player/palette';

it('no theme colour, or one that is not #rrggbb, gives the plain page', () => {
  expect(playerWash(undefined)).toBeUndefined();
  expect(playerWash(null)).toBeUndefined();
  expect(playerWash('')).toBeUndefined();
  expect(playerWash('red')).toBeUndefined();
  expect(playerWash('#abc')).toBeUndefined();
  expect(tintOverPage('nope', 0.5)).toBeUndefined();
});

it('a colour is laid over the page at the strongest strength the words still read on', () => {
  // Measured 2026-10-03: the brand yellow passes at 40 %, a deep blue only at 20 %.
  expect(playerWash('#fcc522')).toEqual(['#fbe49e', colour.background, colour.background]);
  expect(playerWash('#1d4ed8')?.[0]).toBe(tintOverPage('#1d4ed8', 0.2));
  expect(playerWash('1d4ed8')?.[0]).toBe(tintOverPage('#1d4ed8', 0.2));
});

it('whatever it returns, the text and secondary text read on the top of the wash', () => {
  for (const tint of ['#1d4ed8', '#fcc522', '#e11d48', '#0f766e', '#000000', '#7f7f7f', '#ffffff']) {
    const wash = playerWash(tint);
    if (wash === undefined) continue;
    expect(readableOnPage(wash[0])).toBe(true);
    expect(contrastRatio(colour.text, wash[0])).toBeGreaterThanOrEqual(BODY_MIN);
    expect(contrastRatio(colour.muted, wash[0])).toBeGreaterThanOrEqual(BODY_MIN);
    expect(wash[2]).toBe(colour.background);
  }
});
