// Checks that every text colour class used in app/ and src/ has a measured contrast pair.
/**
 * M31 T098 (converge round 1, G16 / SC-004): `PAIRS` in src/design/contrast.ts was written by hand, so a
 * colour could be used for words without ever being measured (`text-quote`, 17 uses, was in no pair).
 * This test reads the colour tokens, greps every `text-<token>` class in app/ and src/, and fails
 * naming each token whose value is the foreground of no pair.
 *
 * Break it to see it red: delete the `colour.quote` pairs from PAIRS (or use a new `text-<token>` class
 * for a token with no pair) and run this file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { colour } from '@/design/tokens';
import { ACCENT_PAIRS, PAIRS, contrastRatio } from '@/design/contrast';

const MOBILE = join(__dirname, '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** token name -> files using `text-<token>` (the vendored gluestack library under src/ui/lib is included: its classes render too). */
function textTokensUsed(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const re = /(?<![\w-])text-([A-Za-z0-9]+)(?![\w-])/g;
  for (const file of [...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src'))]) {
    for (const m of readFileSync(file, 'utf8').matchAll(re)) {
      const token = m[1]!;
      if (typeof (colour as Record<string, unknown>)[token] !== 'string') continue;
      used.set(token, [...(used.get(token) ?? []), file.slice(MOBILE.length + 1)]);
    }
  }
  return used;
}

const foregrounds = (): Set<string> => new Set([...PAIRS, ...ACCENT_PAIRS].map((p) => p.fg.toLowerCase()));

describe('G-M31-T098: every text colour token in use has a measured pair', () => {
  const used = textTokensUsed();

  it('the scan finds the tokens the app is known to use', () => {
    for (const t of ['text', 'text2', 'text3', 'hotText', 'quote', 'hotEnd', 'background', 'void']) expect([...used.keys()]).toContain(t);
  });

  it('each used text-<token> has a PAIRS (or ACCENT_PAIRS) row whose foreground is that colour', () => {
    const fg = foregrounds();
    const missing = [...used.keys()].filter((t) => !fg.has((colour as Record<string, string>)[t]!.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('the three that were missing are measured on the surfaces they sit on, at the body floor', () => {
    const ratio = (fgv: string, bg: string) => contrastRatio(fgv, bg);
    for (const bg of [colour.void, colour.raise, colour.raise2]) {
      expect(ratio(colour.quote, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour.hotEnd, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(colour.background, colour.accent)).toBeGreaterThanOrEqual(4.5);
    for (const [fgv, bgv] of [[colour.quote, colour.void], [colour.quote, colour.raise], [colour.quote, colour.raise2], [colour.hotEnd, colour.void], [colour.hotEnd, colour.raise], [colour.background, colour.accent]] as const) {
      expect(PAIRS.some((p) => p.fg === fgv && p.bg === bgv)).toBe(true);
    }
  });
});
