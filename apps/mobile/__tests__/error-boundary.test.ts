// Checks that an app crash shows a "Try again" screen, never a blank page.
/**
 * M12 T004 (Principle IV): an error shows a way back, never a blank app. Rendered: the
 * `ErrorBoundary` that app/_layout.tsx exports (expo-router draws it when a screen throws), with
 * every provider the layout wires replaced by a pass-through so only the layout's own code runs.
 *
 * The break that turns it red: remove the `ErrorBoundary` export from app/_layout.tsx, or its
 * `props.retry()`.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { recentErrors, resetErrorReports } from '@/telemetry/reportError';

// app/_layout.tsx imports the whole app. Each provider, sheet and start-up hook becomes a
// pass-through or nothing (function declarations, so the hoisted factories can use them).
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

type Layout = typeof import('../app/_layout');

beforeEach(() => resetErrorReports());

it('the root layout exports an ErrorBoundary: a title, the reassurance, and a Try again button that retries', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ErrorBoundary } = require('../app/_layout') as Layout;
  expect(typeof ErrorBoundary).toBe('function');
  const retry = jest.fn(() => Promise.resolve());
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(ErrorBoundary, { error: new Error('boom'), retry })); });

  const text = JSON.stringify(r.toJSON());
  expect(text).toContain('Something went wrong');
  expect(text).toContain('Your listening and downloads are safe.');
  const button = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Try again' && n.props['accessibilityRole'] === 'button' && typeof n.props['onPress'] === 'function')[0];
  expect(button).toBeDefined();
  expect(retry).not.toHaveBeenCalled();
  act(() => { button!.props['onPress'](); });
  expect(retry).toHaveBeenCalledTimes(1);
  // M23 US8: the crash leaves a trace in the app's own error log.
  expect(recentErrors().map((e) => e.scope)).toContain('screen.crash');
  act(() => r.unmount());
  quiet.mockRestore();
});
