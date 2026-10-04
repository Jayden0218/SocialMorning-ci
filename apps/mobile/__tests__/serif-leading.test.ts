// Checks that no serif title has a line height too small for Lora, which Android would cut off.
/**
 * Owner, 2026-10-04: "the text has been cropped". Lora is 1.28 × its size tall (32.2 above the
 * baseline + 8.8 below at 32 pt, read from its font file) and Android clips text to its line
 * height, so a `font-display` title with `leading-[N]` below that lost the bottom of g / y / p.
 *
 * The break that turns it red: put `leading-[36px]` back on PageHeader's 32 pt title.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SERIF_MIN_LEADING, display } from '@/ui/auth/display';

const ROOT = join(__dirname, '..');
const SIZES: Record<string, number> = { micro: 11, xs: 12, meta: 13, body: 14, sm: 16, title: 17, base: 20, lg: 24, hero: 28, display: 32 };

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return /node_modules|ui[\\/]lib$/.test(p) ? [] : files(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

it('every font-display title with a written line height is tall enough for the serif', () => {
  const tight: string[] = [];
  for (const f of [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))]) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!/font-display/.test(line)) return;
      const lead = /leading-\[(\d+)px\]/.exec(line);
      const size = /text-\[(\d+)px\]/.exec(line) ?? /\btext-(micro|xs|meta|body|sm|title|base|lg|hero|display)\b/.exec(line);
      if (!lead || !size) return;
      const pt = Number(size[1]) || SIZES[size[1]!]!;
      if (Number(lead[1]) < Math.ceil(pt * 1.28)) tight.push(`${relative(ROOT, f)}:${i + 1} ${pt} pt on ${lead[1]}`);
    });
  }
  expect(tight).toEqual([]);
});

it('display() never makes a line shorter than the serif, whatever it is asked', () => {
  expect(display(44, '#000', { leading: 48 }).lineHeight).toBeGreaterThanOrEqual(Math.ceil(44 * SERIF_MIN_LEADING));
  expect(display(20, '#000', { leading: 40 }).lineHeight).toBe(40);
});
