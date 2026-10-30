// Checks that no screen uses the native iOS header or native alert.
/**
 * M16a guard G-N1 (FR-012, FR-013, FR-016; owner 2026-10-02, said twice): no iOS-native chrome.
 *  - the root stack hides the native header for every screen, and no screen turns it back on;
 *  - every page in the stack draws the app's own bar (PageHeader, TopBar or FollowList, which
 *    draws a PageHeader), except the pages listed in OWN_BAR, which draw their own top;
 *  - no code calls the native alert (`Alert.alert`) — confirmations use src/ui/kit/confirm.tsx;
 *  - no file outside src/ui/lib uses the native switch — on/off is src/ui/kit/Toggle.tsx.
 *
 * The root stack's options are read from a RENDER of app/_layout.tsx, with expo-router's Stack
 * replaced by a stand-in that keeps the options it is given (the native header itself is drawn
 * by the navigator, which no renderer test can show — the phone row, Tier B, is the real
 * evidence). The rest stay source scans, each a rule over every file in app/ (and src/): no file
 * turns the header on or presents a sheet, every page draws its own bar, no native alert, no
 * native switch; and the player page's `useSwipeDownToClose(close)` (app/player.tsx needs the
 * whole player, queue, comments and gestures to render).
 *
 * The break that turns it red: set one screen's `headerShown: true` in app/_layout.tsx (e.g.
 * `<Stack.Screen name="inbox" options={{ title: 'Inbox', headerShown: true }} />`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

// app/_layout.tsx imports the whole app. Each provider, sheet and start-up hook becomes a
// pass-through or nothing (function declarations, so the hoisted factories can use them).
// The Stack stand-in draws its screens as elements, so their options can be read from the tree.
function mockPass(p: { children?: React.ReactNode }): React.ReactNode { return p.children ?? null; }
function mockNone(): null { return null; }
jest.mock('../global.css', () => ({}));
jest.mock('@/design/tailwind', () => ({}));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: mockPass }));
jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), SafeAreaListener: mockPass }));
jest.mock('expo-router', () => {
  const Stack = Object.assign((p: { children?: React.ReactNode }) => mockPass(p), { Screen: mockNone });
  return { Stack, usePathname: () => '/', useSegments: () => ['(tabs)'] };
});
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: () => Promise.resolve(true), hide: () => undefined }));
jest.mock('expo-status-bar', () => ({ StatusBar: mockNone }));
jest.mock('@/playback/store', () => ({ usePlayerSelector: (pick: (s: { kind: string }) => unknown) => pick({ kind: 'idle' }) }));
jest.mock('@/ui/lib/safe-area-view', () => ({ SafeAreaView: mockPass }));
jest.mock('@/ui/shell/providers', () => ({ AppProviders: mockPass, useStores: () => ({ settings: { get: () => undefined }, feedCache: {}, auth: { get: () => undefined } }) }));
jest.mock('@/ui/kit/useColours', () => ({ useColours: () => ({ background: '#fbf7ee' }) }));
jest.mock('@/social/context', () => ({ SocialProvider: mockPass }));
jest.mock('@/graph/context', () => ({ GraphProvider: mockPass }));
jest.mock('@/safety/context', () => ({ SafetyProvider: mockPass }));
jest.mock('@/outside/CarLibrarySync', () => ({ CarLibrarySync: mockNone }));
jest.mock('@/ui/player/MiniPlayer', () => ({ MiniPlayer: mockNone, miniPlayerShows: () => false }));
jest.mock('@/ui/lib/gluestack-ui-provider', () => ({ GluestackUIProvider: mockPass }));
jest.mock('@/ui/shell/RateSheet', () => ({ RateSheet: mockNone }));
jest.mock('@/ui/auth/PendingDeletion', () => ({ PendingDeletionSheet: mockNone }));
jest.mock('@/ui/queue/QueueSheetHost', () => ({ QueueSheetHost: mockPass }));
jest.mock('@/ui/shell/consent', () => ({ consentGiven: () => false }));
jest.mock('@/ui/discover/InterestsGate', () => ({ InterestsGate: mockNone }));
jest.mock('@/ui/shell/startupExtras', () => ({ useStartupExtras: () => undefined }));
jest.mock('@/config/useStartConfig', () => ({ useStartConfig: () => undefined }));
jest.mock('@/ui/shell/iconReset', () => ({ useIconReset: () => undefined }));
jest.mock('@/ui/player/DataPrompt', () => ({ DataPrompt: mockNone }));

type ScreenOptions = { headerShown?: boolean; presentation?: string; animation?: string; gestureEnabled?: boolean };

/** Render the root layout once; return the Stack's own options and each screen's, by name. */
function rootStack(): { options: ScreenOptions; screens: Map<string, ScreenOptions> } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: RootLayout } = require('../app/_layout') as typeof import('../app/_layout');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Stack } = require('expo-router') as { Stack: ((p: object) => unknown) & { Screen: () => null } };
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(RootLayout)); });
  const stack: ReactTestInstance = r.root.findByType(Stack as never);
  const screens = new Map<string, ScreenOptions>(
    r.root.findAllByType(Stack.Screen as never).map((n) => [n.props['name'] as string, (n.props['options'] ?? {}) as ScreenOptions]),
  );
  const options = (stack.props['screenOptions'] ?? {}) as ScreenOptions;
  act(() => r.unmount());
  return { options, screens };
}

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

it('the root stack hides the native header for every screen, and none of its screens turns it back on (rendered)', () => {
  const { options, screens } = rootStack();
  expect(options.headerShown).toBe(false);
  expect(screens.size).toBeGreaterThanOrEqual(40); // the stand-in saw the screens — otherwise this proves nothing
  expect([...screens].filter(([, o]) => o.headerShown === true).map(([name]) => name)).toEqual([]);
});

it('no file in app/ turns the native header back on (source scan: nested layouts and pages too)', () => {
  const on = walk(APP).filter((f) => /headerShown:\s*true/.test(readFileSync(f, 'utf8'))).map(rel);
  expect(on).toEqual([]);
});

it('every page in the stack draws the app\'s own bar', () => {
  expect(routes.length).toBeGreaterThanOrEqual(40); // the scan found the pages — otherwise this proves nothing
  // A page that only redirects (`/inbox` → Updates, owner 2026-10-04) draws nothing, so needs no bar.
  const bare = routes.filter((f) => !/<(PageHeader|TopBar|FollowList|Redirect)\b/.test(readFileSync(join(ROOT, f), 'utf8')));
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

/**
 * M21 guard G-M21-11: no screen is presented as an iOS sheet. A `formSheet` / `pageSheet` is the
 * native card with its own grabber and corner radius; our sheets are our own views. The voice
 * status recorder (`voice/new`, a full-screen `modal`) is the one named exception to any
 * `presentation`, and it is not a sheet either. The player stays a push that slides up (R7).
 *
 * The break that turns it red: add `presentation: 'formSheet'` to any screen in app/_layout.tsx
 * (e.g. the player's options).
 */
it('G-M21-11: no file presents a formSheet or pageSheet (source scan over every file in app/)', () => {
  const sheets = walk(APP).filter((f) => /presentation:\s*['"](formSheet|pageSheet)['"]/.test(readFileSync(f, 'utf8'))).map(rel);
  expect(sheets).toEqual([]);
});

it('G-M21-11: in the rendered root stack only voice/new sets a presentation, and it is a full-screen modal', () => {
  const { options, screens } = rootStack();
  expect(options.presentation).toBeUndefined();
  const presented = [...screens].filter(([, o]) => o.presentation !== undefined).map(([name, o]) => [name, o.presentation]);
  expect(presented).toEqual([['voice/new', 'modal']]);
});

it('G-M21-11: the player slides up as a push; its own top-bar pan closes it, not the native gesture', () => {
  const player = rootStack().screens.get('player');
  expect(player).toBeDefined();
  expect(player!.animation).toBe('slide_from_bottom');
  // iPhone walk 2026-10-07 (Debug + Metro log): the native screen gesture took every vertical
  // drag after ~10 pt, so the swipe up to the playlist never arrived. It is off on the player.
  expect(player!.gestureEnabled).toBe(false);
  expect(player!.presentation).toBeUndefined();
  // Source check: the player page needs the whole player, queue and gesture stack to render.
  expect(readFileSync(join(APP, 'player.tsx'), 'utf8')).toMatch(/useSwipeDownToClose\(close\)/);
});

it('no file outside src/ui/lib uses the native switch', () => {
  const files = [...walk(APP), ...walk(join(ROOT, 'src'))];
  const hits = files.filter((f) => {
    const s = readFileSync(f, 'utf8');
    return /import\s*\{[^}]*\bSwitch\b[^}]*\}\s*from\s*'react-native'/.test(s) || /from\s*'[^']*\/lib\/switch'/.test(s);
  }).map(rel);
  expect(hits).toEqual([]);
});
