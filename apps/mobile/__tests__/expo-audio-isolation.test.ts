/**
 * The one architectural rule this milestone cannot afford to lose.
 *
 * `src/playback/expo-audio-adapter.ts` is the only module allowed to import
 * `expo-audio`. tasks.md calls a breach "a review failure"; a review is a
 * person remembering, so this is the same rule as a test that fails the
 * build. The moment a screen or the reducer imports the native module,
 * everything above the adapter stops being runnable in Node and SC-010's
 * full branch coverage becomes impossible — quietly, and weeks later.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const ALLOWED = join('src', 'playback', 'expo-audio-adapter.ts');
const SEARCHED = ['app', 'src'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

it('only the adapter imports expo-audio', () => {
  const offenders: string[] = [];
  for (const dir of SEARCHED) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const relative = file.slice(ROOT.length + 1);
      if (relative === ALLOWED) continue;
      if (/from\s+['"]expo-audio['"]|require\(\s*['"]expo-audio['"]\s*\)/.test(
          readFileSync(file, 'utf8'))) {
        offenders.push(relative);
      }
    }
  }
  expect(offenders).toEqual([]);
});

// `node` is in tsconfig's `types` so that THIS file can walk the tree. That
// would otherwise make `node:fs` look available to app code, where it does
// not exist. So the same walk forbids it.
it('no app or src module imports a node: builtin — the phone has none', () => {
  const offenders: string[] = [];
  for (const dir of SEARCHED) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      if (/from\s+['"]node:|require\(\s*['"]node:/.test(readFileSync(file, 'utf8'))) {
        offenders.push(file.slice(ROOT.length + 1));
      }
    }
  }
  expect(offenders).toEqual([]);
});

it('the reducer and its pure neighbours import nothing from expo or react', () => {
  // FR-024: this logic must be exercisable with no device. An import here is
  // what would make that false.
  for (const name of ['reducer.ts', 'finished.ts', 'types.ts']) {
    const source = readFileSync(join(ROOT, 'src', 'playback', name), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const specifier of imports) {
      expect(specifier).toMatch(/^\.\//);
    }
  }
});
