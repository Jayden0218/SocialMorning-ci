// Checks that only one launch screen shows, hidden once the first page draws.
/**
 * One launch screen, then the first page (owner, 2026-09-29). Found on the iPhone: the
 * native launch screen hid by itself, a white page showed while the in-app copy of it
 * loaded its image, and Agree brought the splash back before the sign-in page.
 *
 * Run, not read: loading app/_layout.tsx (with its providers replaced by pass-throughs) must
 * call `SplashScreen.preventAutoHideAsync()` once, at load, and must not hide the splash itself.
 * Kept as source checks, each with its reason: the app.json launch-screen config (a config
 * fact); `SplashScreen.hide()` in src/ui/shell/providers.tsx (AppProviders opens the database,
 * builds the audio player and starts ~10 syncs — far too much to stand up for one call); and
 * "no file draws <Splash />" (a rule over every file).
 *
 * The break that turns it red: remove `SplashScreen.preventAutoHideAsync()` from
 * app/_layout.tsx, or render a `<Splash />` again.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { colour } from '@/design/tokens';

// app/_layout.tsx imports the whole app. Each provider, sheet and start-up hook becomes a
// pass-through or nothing (function declarations, so the hoisted factories can use them).
function mockPass(p: { children?: React.ReactNode }): React.ReactNode { return p.children ?? null; }
function mockNone(): null { return null; }
const mockSplash = { prevent: jest.fn(() => Promise.resolve(true)), hide: jest.fn() };
jest.mock('../global.css', () => ({}));
jest.mock('@/design/tailwind', () => ({}));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: mockPass }));
jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), SafeAreaListener: mockPass }));
jest.mock('expo-router', () => {
  const Stack = Object.assign((p: { children?: React.ReactNode }) => mockPass(p), { Screen: mockNone });
  return { Stack, usePathname: () => '/', useSegments: () => ['(tabs)'] };
});
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: () => mockSplash.prevent(), hide: () => mockSplash.hide() }));
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

it('the native launch screen does not hide by itself: loading the root layout holds it, once, and does not hide it', () => {
  expect(mockSplash.prevent).not.toHaveBeenCalled();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const layout = require('../app/_layout') as typeof import('../app/_layout');
  expect(typeof layout.default).toBe('function'); // the layout really loaded
  expect(mockSplash.prevent).toHaveBeenCalledTimes(1);
  expect(mockSplash.hide).not.toHaveBeenCalled();
});

it('it is hidden in one place, once the first page is drawn (source check: see the header)', () => {
  expect(read('src/ui/shell/providers.tsx')).toContain('SplashScreen.hide()');
});

it('no screen draws a second, in-app splash', () => {
  const offenders = [...sources('app'), ...sources('src')].filter((f) => /<Splash\b/.test(read(f)));
  expect(offenders).toEqual([]);
});
