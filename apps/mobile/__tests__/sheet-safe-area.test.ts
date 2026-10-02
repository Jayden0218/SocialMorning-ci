/**
 * M16a guard G-S1 (FR-009, gluestack audit P0): every bottom sheet clears the home indicator.
 * gluestack's ActionsheetContent pads its bottom with `pb-safe`, but UniWind's free engine only
 * knows the safe-area insets when the app hands them over (`Uniwind.updateInsets`, as the
 * upstream starter does with SafeAreaListener — docs.uniwind.dev/faq). Without it `pb-safe` was 0,
 * and the sheets carried guessed `pb-10` / `pb-24` instead (three had nothing at all).
 *
 * A source scan: the inset is a native value, so only the phone (Tier B) shows the pixels.
 *
 * The break that turns it red: remove the `updateInsets` listener (the <SafeAreaListener …>
 * around the app in app/_layout.tsx).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'lib') walk(p, out); continue; }
    if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
};

it('the root hands the safe-area insets to UniWind', () => {
  const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');
  expect(layout).toMatch(/<SafeAreaListener onChange=\{\(\{ insets \}\) => Uniwind\.updateInsets\(insets\)\}>/);
  expect(layout).toMatch(/import \{ SafeAreaListener \} from 'react-native-safe-area-context';/);
});

it('the sheet base still pads by the inset', () => {
  const lib = readFileSync(join(ROOT, 'src/ui/lib/actionsheet/index.tsx'), 'utf8');
  expect(lib).toMatch(/actionsheetContentStyle = tva\(\{\s*base: '[^']*\bpb-safe\b/);
});

it('no sheet overrides the inset with a fixed bottom padding', () => {
  const offenders: string[] = [];
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<ActionsheetContent\b[^>]*className="([^"]*)"/g)) {
      // A bottom or all-sides padding on the caller would win over (or fight) the base's pb-safe.
      if (/(?:^|\s)(?:pb|p|py)-(?!safe)\S+/.test(m[1]!)) offenders.push(`${relative(ROOT, f).split(sep).join('/')}: ${m[1]}`);
    }
  }
  expect(files.length).toBeGreaterThan(50);
  expect(offenders).toEqual([]);
});
