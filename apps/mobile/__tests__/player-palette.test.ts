// Tests that a show's theme colour tints the player only while text stays readable.
/**
 * M17 (constitution v3.0.0, `Player-B`): the player uses the page palette (dark since M31), and a
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
  // M31 (dark only): measured against the near-black page. The strongest of 40, 30, 20, 12 % at
  // which text, secondary text and the accent all clear 4.5 is the one taken; a bright colour steps
  // down further than a deep one.
  const strongest = (hex: string) => [0.4, 0.3, 0.2, 0.12].find((s) => readableOnPage(tintOverPage(hex, s)!))!;
  expect(strongest('#1d4ed8')).toBeGreaterThan(strongest('#fcc522'));
  expect(playerWash('#fcc522')).toEqual([tintOverPage('#fcc522', strongest('#fcc522')), colour.background, colour.background]);
  expect(playerWash('#1d4ed8')?.[0]).toBe(tintOverPage('#1d4ed8', strongest('#1d4ed8')));
  expect(playerWash('1d4ed8')?.[0]).toBe(tintOverPage('#1d4ed8', strongest('#1d4ed8')));
});

it('whatever it returns, the text and secondary text read on the top of the wash', () => {
  for (const tint of ['#1d4ed8', '#fcc522', '#e11d48', '#0f766e', '#000000', '#7f7f7f', '#ffffff']) {
    const wash = playerWash(tint);
    if (wash === undefined) continue;
    expect(readableOnPage(wash[0])).toBe(true);
    expect(contrastRatio(colour.text, wash[0])).toBeGreaterThanOrEqual(BODY_MIN);
    expect(contrastRatio(colour.muted, wash[0])).toBeGreaterThanOrEqual(BODY_MIN);
    expect(contrastRatio(colour.accent, wash[0])).toBeGreaterThanOrEqual(BODY_MIN);
    expect(wash[2]).toBe(colour.background);
  }
});
