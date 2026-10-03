/**
 * M12 guard G-T2: theme colours are written in UniWind's documented form — the real colour,
 * hex or rgba(), under its `--color-` name (docs.uniwind.dev/theming/global-css). One light
 * set only since M17 (constitution v3.0.0).
 *
 * Found on the iPhone 2026-09-29: the M9 form (`--x: r g b / a` read through `rgb(var(--x))`)
 * lost every alpha, so hairline separators drew as solid black outlines, every sheet's scrim
 * was an opaque black backdrop, and a 14 % tint drew nothing at all. `theme-sync` stayed green
 * throughout — it only proves the file matches the generator, not that UniWind can read it.
 *
 * The break that turns it red: make `css()` in scripts/tokens-to-css.mjs return the channel
 * form again and regenerate.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { colour } from '../src/design/tokens';

const css = readFileSync(join(__dirname, '..', 'global.css'), 'utf8');
const block = (name: string): string => {
  const at = css.indexOf(`@variant ${name} {`);
  return css.slice(at, css.indexOf('}', at));
};
const COLOUR = /^#[0-9a-f]{6}$|^rgba?\(\d+, \d+, \d+(, [\d.]+)?\)$/;

it.each([['light', colour]] as const)('every %s token is a --color- variable holding a real colour', (name, palette) => {
  const lines = [...block(name).matchAll(/--color-([A-Za-z]+): ([^;]+);/g)];
  expect(lines.map((m) => m[1]).sort()).toEqual(Object.keys(palette).sort());
  for (const [, key, value] of lines) expect([key, COLOUR.test(value!)]).toEqual([key, true]);
});

it('no colour is read through rgb(var(...)), which drops the alpha', () => {
  expect(css).not.toMatch(/rgb\(var\(/);
});
