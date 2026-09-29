/**
 * FR-028: every Studio colour comes from the app's tokens, and every pair the Studio draws
 * meets WCAG AA — measured here, in both themes, on every run.
 *
 * The breaks that turn it red: put `color: #333;` in `src/styles.css` (the literal scan), or
 * change `onFill` in `src/tokens.ts` to `colour.onPrimary` (white on yellow, 1.60).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dark, light, type Role } from '../src/tokens';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

describe('colour literals', () => {
  it('none in src/ outside tokens.ts', () => {
    const hits = files(SRC)
      .filter((f) => !f.endsWith('tokens.ts'))
      .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f, i: i + 1, line })))
      .filter(({ line }) => LITERAL.test(line.replace(/url\(#[\w-]+\)/g, '')));
    expect(hits.map(({ f, i, line }) => `${f}:${i} ${line.trim()}`)).toEqual([]);
  });
});

// WCAG 2.x relative luminance and contrast ratio, from the definition.
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

/** Every text/background pair the Studio's CSS uses, with its floor (4.5 text, 3 for a graphic). */
const PAIRS: [fg: Role, bg: Role, floor: number][] = [
  ['text', 'background', 4.5], ['text', 'surface', 4.5],
  ['muted', 'background', 4.5], ['muted', 'surface', 4.5],
  ['accent', 'background', 4.5], ['accent', 'surface', 4.5],
  ['onFill', 'primary', 4.5],
];

describe.each([['light', light], ['dark', dark]] as const)('contrast (%s)', (_, p) => {
  it.each(PAIRS)('%s on %s ≥ %s', (fg, bg, floor) => {
    expect(ratio(p[fg], p[bg])).toBeGreaterThanOrEqual(floor);
  });
});
