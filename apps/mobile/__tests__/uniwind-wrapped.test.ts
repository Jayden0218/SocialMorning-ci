/**
 * UniWind styles only components it knows. A third-party component given a `className`
 * must come through `withUniwind` (src/design/tailwind.ts), or the class is silently
 * dropped. Found on the iPhone 2026-09-29: the player's LinearGradient lost `flex-1`,
 * collapsed to zero height, and the whole app showed a blank white screen.
 *
 * The break that turns it red: import LinearGradient from 'expo-linear-gradient' in
 * app/player.tsx again.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (rel === 'src/ui/lib') return [];
    if (statSync(join(root, rel)).isDirectory()) return sources(rel);
    return /\.tsx$/.test(name) ? [rel] : [];
  });
}
const files = [...sources('app'), ...sources('src')].filter((f) => f !== 'src/design/tailwind.ts');

it('LinearGradient always comes from src/design/tailwind', () => {
  const raw = files.filter((f) => /import \{[^}]*\bLinearGradient\b[^}]*\} from 'expo-linear-gradient'/.test(readFileSync(join(root, f), 'utf8')));
  expect(raw).toEqual([]);
});

it('a Link given a className comes from src/design/tailwind', () => {
  const raw = files.filter((f) => {
    const s = readFileSync(join(root, f), 'utf8');
    return /import \{[^}]*\bLink\b[^}]*\} from 'expo-router'/.test(s) && /<Link\b[^>]*\bclassName=/.test(s);
  });
  expect(raw).toEqual([]);
});
