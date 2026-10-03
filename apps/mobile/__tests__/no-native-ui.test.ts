/**
 * M16a guard G-N1 (FR-012, FR-013, FR-016; owner 2026-10-02, said twice): no iOS-native chrome.
 *  - the root stack hides the native header for every screen, and no screen turns it back on;
 *  - every page in the stack draws the app's own bar (PageHeader, TopBar or FollowList, which
 *    draws a PageHeader), except the pages listed in OWN_BAR, which draw their own top;
 *  - no code calls the native alert (`Alert.alert`) — confirmations use src/ui/kit/confirm.tsx;
 *  - no file outside src/ui/lib uses the native switch — on/off is src/ui/kit/Toggle.tsx.
 *
 * A source scan, like no-double-inset: the native header is a navigator option, not something a
 * renderer test can see. The phone row (Tier B) is the real evidence.
 *
 * The break that turns it red: set one screen's `headerShown: true` in app/_layout.tsx (e.g.
 * `<Stack.Screen name="inbox" options={{ title: 'Inbox', headerShown: true }} />`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..');
const APP = join(ROOT, 'app');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'lib') walk(p, out); continue; }
    if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
};
const rel = (p: string): string => relative(ROOT, p).split(sep).join('/');

/** Pages that draw their own top: the tab screens, Search, the scanner and the sign-in pages. */
const OWN_BAR = ['app/search.tsx', 'app/scan.tsx', 'app/auth/sign-in.tsx', 'app/auth/sign-up.tsx', 'app/auth/email.tsx'];
const routes = walk(APP).map(rel).filter((f) => !f.endsWith('_layout.tsx') && !f.startsWith('app/(tabs)/') && !OWN_BAR.includes(f));

it('the root stack hides the native header for every screen', () => {
  const layout = readFileSync(join(APP, '_layout.tsx'), 'utf8');
  const options = layout.slice(layout.indexOf('screenOptions={{'), layout.indexOf('}}', layout.indexOf('screenOptions={{')));
  expect(options).toMatch(/headerShown:\s*false/);
});

it('no screen turns the native header back on', () => {
  const on = walk(APP).filter((f) => /headerShown:\s*true/.test(readFileSync(f, 'utf8'))).map(rel);
  expect(on).toEqual([]);
});

it('every page in the stack draws the app\'s own bar', () => {
  expect(routes.length).toBeGreaterThanOrEqual(40); // the scan found the pages — otherwise this proves nothing
  const bare = routes.filter((f) => !/<(PageHeader|TopBar|FollowList)\b/.test(readFileSync(join(ROOT, f), 'utf8')));
  expect(bare).toEqual([]);
});

it('no code calls the native alert', () => {
  const files = [...walk(APP), ...walk(join(ROOT, 'src'))];
  const hits = files.filter((f) => {
    const s = readFileSync(f, 'utf8');
    return /\bAlert\.alert\s*\(/.test(s) || /import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*'react-native'/.test(s);
  }).map(rel);
  expect(hits).toEqual([]);
});

it('no file outside src/ui/lib uses the native switch', () => {
  const files = [...walk(APP), ...walk(join(ROOT, 'src'))];
  const hits = files.filter((f) => {
    const s = readFileSync(f, 'utf8');
    return /import\s*\{[^}]*\bSwitch\b[^}]*\}\s*from\s*'react-native'/.test(s) || /from\s*'[^']*\/lib\/switch'/.test(s);
  }).map(rel);
  expect(hits).toEqual([]);
});
