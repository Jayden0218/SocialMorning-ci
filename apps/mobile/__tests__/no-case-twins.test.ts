// Checks that no two code files in one folder differ only by letter case or extension.
/**
 * On a Mac, file names ignore case, and TypeScript keeps only one of `terms.ts` and `Terms.tsx`
 * (a `.ts` beats a `.tsx` of the same name). `Terms.tsx` silently left the editor's project, so
 * every import in it showed red on the owner's laptop while the cloud (Linux) stayed green.
 * Found 2026-10-04; `terms.ts` became `consent.ts`.
 *
 * The break that turns it red: add `src/ui/shell/terms.ts` next to `Terms.tsx`.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

function twins(dir: string, out: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') twins(p, out); continue; }
    if (!/\.(tsx?|jsx?)$/.test(name) || name.endsWith('.d.ts')) continue;
    const key = name.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
    const other = seen.get(key);
    if (other) out.push(`${relative(ROOT, dir)}: ${other} / ${name}`);
    else seen.set(key, name);
  }
  return out;
}

it('no folder in app/ or src/ holds two files whose names differ only by case or extension', () => {
  expect([...twins(join(ROOT, 'app')), ...twins(join(ROOT, 'src'))]).toEqual([]);
});
