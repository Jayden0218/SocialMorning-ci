/**
 * One launch screen, then the first page (owner, 2026-09-29). Found on the iPhone: the
 * native launch screen hid by itself, a white page showed while the in-app copy of it
 * loaded its image, and Agree brought the splash back before the sign-in page.
 *
 * The break that turns it red: remove `SplashScreen.preventAutoHideAsync()` from
 * app/_layout.tsx, or render a `<Splash />` again.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { colour } from '../src/design/tokens';

const root = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const app = JSON.parse(read('app.json'));
const plugin = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) return sources(rel);
    return /\.tsx?$/.test(name) ? [rel] : [];
  });
}

it('app.json configures the native launch screen with the icon, on the screen background', () => {
  expect(plugin).toBeDefined();
  expect(existsSync(join(root, plugin[1].image))).toBe(true);
  expect(String(plugin[1].backgroundColor).toLowerCase()).toBe(colour.background.toLowerCase());
});

it('the native launch screen does not hide by itself', () => {
  expect(read('app/_layout.tsx')).toMatch(/^void SplashScreen\.preventAutoHideAsync\(\);$/m);
});

it('it is hidden in one place, once the first page is drawn', () => {
  expect(read('src/ui/providers.tsx')).toContain('SplashScreen.hide()');
});

it('no screen draws a second, in-app splash', () => {
  const offenders = [...sources('app'), ...sources('src')].filter((f) => /<Splash\b/.test(read(f)));
  expect(offenders).toEqual([]);
});
