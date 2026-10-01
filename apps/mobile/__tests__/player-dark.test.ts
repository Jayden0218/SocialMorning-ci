/**
 * Owner, 2026-10-01 (the 小宇宙 player): the player page is dark whatever the app theme, and
 * a show's Studio theme colour tints its top — but only as far as the dark palette's words
 * still read on it (4.5:1 for text AND secondary text).
 *
 * The breaks that turn these red: drop the `readableOnDark` check from `playerWash` (white
 * comes back as a wash the muted text cannot be read on); take `<PlayerDark>` off a return in
 * app/player.tsx.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BODY_MIN, colourDark, contrastRatio } from '../src/design';
import { darken, playerWash, readableOnDark } from '../src/ui/player/palette';

it('no theme colour, or one that is not #rrggbb, gives the plain dark page', () => {
  expect(playerWash(undefined)).toBeUndefined();
  expect(playerWash(null)).toBeUndefined();
  expect(playerWash('')).toBeUndefined();
  expect(playerWash('red')).toBeUndefined();
  expect(playerWash('#abc')).toBeUndefined();
  expect(darken('nope', 0.5)).toBeUndefined();
});

it('a colour is darkened toward the dark background until both text colours clear the floor', () => {
  // Measured 2026-10-01: blue passes at 50 %, the brand yellow only at 20 %.
  expect(playerWash('#1d4ed8')).toEqual(['#173076', colourDark.background, colourDark.background]);
  expect(playerWash('1d4ed8')?.[0]).toBe('#173076');
  expect(playerWash('#fcc522')?.[0]).toBe('#403517');
});

it('a colour that cannot be made readable is refused — white never becomes a grey wash', () => {
  expect(playerWash('#ffffff')).toBeUndefined();
});

it('whatever it returns, the dark text and secondary text read on the top of the wash', () => {
  for (const tint of ['#1d4ed8', '#fcc522', '#e11d48', '#0f766e', '#000000', '#7f7f7f']) {
    const wash = playerWash(tint);
    if (wash === undefined) continue;
    expect(readableOnDark(wash[0])).toBe(true);
    expect(contrastRatio(colourDark.text, wash[0])).toBeGreaterThanOrEqual(BODY_MIN);
    expect(contrastRatio(colourDark.muted, wash[0])).toBeGreaterThanOrEqual(BODY_MIN);
    expect(wash[2]).toBe(colourDark.background);
  }
});

it('every way out of the player screen is inside PlayerDark', () => {
  const src = readFileSync(join(__dirname, '../app/player.tsx'), 'utf8');
  const body = src.slice(src.indexOf('export default function PlayerScreen'));
  const returns = body.match(/\n {2,4}return \(\n\s*<(\w+)/g) ?? [];
  expect(returns.length).toBe(3);
  for (const r of returns) expect(r).toMatch(/<PlayerDark$/);
});
