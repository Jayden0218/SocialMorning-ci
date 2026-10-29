// Checks that no screen or part reads the whole player state (which re-renders on every position tick).
/**
 * M31 T099 (converge round 1, G19 / review C4): `usePlayerState()` hands back the whole state, so the
 * component re-renders on every TICK. Screens read what they draw with `usePlayerSelector(selector)`.
 * The hook stays exported from src/playback/store.ts (the definition, and the provider tests); nothing
 * in app/ or src/ outside src/playback/ may import or call it.
 *
 * Break it to see it red: put `usePlayerState` back in app/settings/network.tsx.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MOBILE = join(__dirname, '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

it('G-M31-T099: no file in app/ or src/ outside src/playback/ uses usePlayerState', () => {
  const users: string[] = [];
  for (const file of [...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'src'))]) {
    const rel = file.slice(MOBILE.length + 1);
    if (rel.startsWith('src/playback/')) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const bare = line.trim();
      if (bare.startsWith('//') || bare.startsWith('*') || bare.startsWith('/*')) return;
      if (/\busePlayerState\b/.test(line)) users.push(`${rel}:${i + 1}`);
    });
  }
  expect(users).toEqual([]);
});
