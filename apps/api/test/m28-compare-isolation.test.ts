// M28 US1 guard G-M28-CMP3: no deployed entry can reach the comparison server or a maintenance override.
/**
 * `scripts/compare-server.ts` reads the maintenance switch as off. That is safe only because nothing deployed can import it.
 * This walks the imports (static, `export … from`, and `import('…')`) of the four entries — `lambda-entry`, `vercel-entry`,
 * `server`, `worker-entry` — and everything they pull in, and fails when:
 *   - any file reached is in `scripts/` (the compare scripts included), or
 *   - any file reached defines a maintenance override (`withoutMaintenance`, or an export named like maintenance + off/override/bypass/skip).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENTRIES = ['src/lambda-entry.ts', 'src/vercel-entry.ts', 'src/server.ts', 'src/worker-entry.ts'];
const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;
const OVERRIDE = /\bwithoutMaintenance\b|\bexport\s+(?:async\s+)?(?:const|function|let)\s+\w*[Mm]aintenance\w*(?:Off|Override|Bypass|Skip)\w*/;

/** Every file the entries reach, with the path that reached it. */
export function reach(entries: readonly string[] = ENTRIES, root = API): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = entries.map((e) => ({ file: join(root, e), via: e }));
  while (queue.length) {
    const { file, via } = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.set(file, via);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(SPEC)) {
      const spec = m[2]!;
      const base = resolve(dirname(file), spec);
      const cand = [base, `${base}.ts`, join(base, 'index.ts')].find((c) => /\.ts$/.test(c) && existsSync(c));
      if (cand) queue.push({ file: cand, via: `${via} -> ${relative(root, cand)}` });
    }
  }
  return seen;
}

test('G-M28-CMP3: the four entries reach nothing in scripts/ and no maintenance override', () => {
  const files = reach();
  assert.ok(files.size > 50, `the walk found the app (${files.size} files)`);
  for (const e of ENTRIES) assert.ok(files.has(join(API, e)), `${e} was walked`);
  const inScripts = [...files].filter(([f]) => relative(API, f).startsWith('scripts/'));
  assert.deepEqual(inScripts.map(([, via]) => via), [], 'an entry reaches a file in scripts/ (the compare server among them)');
  const overrides = [...files.keys()].filter((f) => OVERRIDE.test(readFileSync(f, 'utf8'))).map((f) => relative(API, f));
  assert.deepEqual(overrides, [], 'a file the entries reach defines a maintenance override');
});

test('the walk sees a dynamic import and a re-export (so the guard cannot be walked around)', () => {
  const text = "export * from './a.ts'; const x = await import('./b.ts'); import c from \"../c.ts\"; import d from 'node:fs';";
  assert.deepEqual([...text.matchAll(SPEC)].map((m) => m[2]), ['./a.ts', './b.ts', '../c.ts']);
});

test('the compare server is where the override lives (the guard looks for the right name)', () => {
  assert.match(readFileSync(join(API, 'scripts/compare-server.ts'), 'utf8'), OVERRIDE);
});
