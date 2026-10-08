// Checks that sheets and pop-ups sit inside the app's providers, avoiding crashes.
/**
 * gluestack draws Actionsheets, dialogs and toasts in a portal at GluestackUIProvider, so
 * anything inside a sheet can only reach contexts that wrap that provider. Found on the
 * iPhone 2026-09-29: with the provider outermost, the episode ⋯ sheet threw "useStores must
 * be used inside <AppProviders>" and the Release build crashed (SIGABRT).
 *
 * The same holds for the one playlist sheet (M21 US3): QueueSheetHost draws a sheet whose rows
 * read the stores, so it sits inside the data providers, and it wraps the stack, so the mini
 * player's ≡ (`useQueueSheet()`) can reach it.
 *
 * Rendered, not read: the real `RootLayout` from app/_layout.tsx is drawn with each provider
 * replaced by a stand-in whose hook throws outside it, exactly as the real ones do. The
 * stand-in GluestackUIProvider draws a "portal" that calls all four hooks, as a sheet would.
 *
 * The break that turns it red: move <GluestackUIProvider> back outside <AppProviders> (or
 * <QueueSheetHost> outside <AppProviders>, or <RootStack /> outside <QueueSheetHost>).
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

/** A provider and its hook; the hook throws outside the provider, as the app's own do. */
function mockGuarded(provider: string, hook: string, value: unknown): Record<string, unknown> {
  const { createContext, createElement: h, useContext } = require('react');
  const Ctx = createContext(false);
  const Provider = ({ children }: { children?: unknown }) => h(Ctx.Provider, { value: true }, children);
  Object.defineProperty(Provider, 'name', { value: provider });
  return {
    [provider]: Provider,
    [hook]: () => {
      if (!useContext(Ctx)) throw new Error(`${hook} must be used inside <${provider}>`);
      return value;
    },
  };
}
const mockNothing = () => null;
const mockPass = ({ children }: { children?: unknown }) => children;

jest.mock('../global.css', () => ({}));
jest.mock('@/design/tailwind', () => ({}));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: mockPass }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaListener: mockPass }));
jest.mock('@/ui/lib/safe-area-view', () => ({ SafeAreaView: mockPass }));
jest.mock('expo-router', () => ({
  Stack: Object.assign(mockNothing, { Screen: mockNothing }),
  usePathname: () => '/',
  useSegments: () => ['(tabs)'],
}));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: () => Promise.resolve() }));
jest.mock('expo-status-bar', () => ({ StatusBar: mockNothing }));
jest.mock('@/telemetry/reportError', () => ({ reportError: jest.fn() }));
jest.mock('@/playback/store', () => ({ usePlayerSelector: (f: (s: { kind: string }) => unknown) => f({ kind: 'idle' }) }));
jest.mock('@/ui/shell/providers', () =>
  mockGuarded('AppProviders', 'useStores', { settings: { get: () => 'light' }, auth: { get: () => undefined }, feedCache: {} }));
jest.mock('@/social/context', () => mockGuarded('SocialProvider', 'useSocial', {}));
jest.mock('@/safety/context', () => mockGuarded('SafetyProvider', 'useSafety', {}));
jest.mock('@/graph/context', () => mockGuarded('GraphProvider', 'useGraph', {}));
// The portal: what gluestack draws a sheet into. A sheet's content calls every data hook.
jest.mock('@/ui/lib/gluestack-ui-provider', () => {
  const { createElement: h, Fragment } = require('react');
  const Portal = () => {
    require('@/ui/shell/providers').useStores();
    require('@/social/context').useSocial();
    require('@/safety/context').useSafety();
    require('@/graph/context').useGraph();
    return h('portal', { testID: 'overlay-portal' });
  };
  return { GluestackUIProvider: ({ children }: { children?: unknown }) => h(Fragment, null, children, h(Portal)) };
});
// The playlist host: its sheet reads the stores; `useQueueSheet` throws outside it (as the real one does).
jest.mock('@/ui/queue/QueueSheetHost', () => {
  const g = mockGuarded('QueueSheetHost', 'useQueueSheet', { open: () => undefined, close: () => undefined });
  const { createElement: h, Fragment } = require('react');
  const Host = g['QueueSheetHost'] as never;
  const Sheet = () => { require('@/ui/shell/providers').useStores(); return h('queue-sheet', { testID: 'queue-sheet' }); };
  const QueueSheetHost = ({ children }: { children?: unknown }) => h(Fragment, null, h(Host, null, children), h(Sheet));
  return { QueueSheetHost, useQueueSheet: g['useQueueSheet'] };
});
// The root's mini player opens the playlist sheet with `useQueueSheet().open()`.
jest.mock('@/ui/player/MiniPlayer', () => ({
  MiniPlayer: () => { require('@/ui/queue/QueueSheetHost').useQueueSheet(); return require('react').createElement('mini-player', { testID: 'mini-player' }); },
  miniPlayerShows: () => false,
}));
jest.mock('@/ui/player/mini-player-swipe', () => ({ leavingToTabs: () => undefined, rootBarHidden: () => false }));
jest.mock('@/outside/CarLibrarySync', () => ({ CarLibrarySync: mockNothing }));
jest.mock('@/ui/shell/RateSheet', () => ({ RateSheet: mockNothing }));
jest.mock('@/ui/auth/PendingDeletion', () => ({ PendingDeletionSheet: mockNothing }));
jest.mock('@/ui/shell/consent', () => ({ consentGiven: () => false }));
jest.mock('@/ui/discover/InterestsGate', () => ({ InterestsGate: mockNothing }));
jest.mock('@/ui/shell/startupExtras', () => ({ useStartupExtras: () => undefined }));
jest.mock('@/config/useStartConfig', () => ({ useStartConfig: () => undefined }));
jest.mock('@/ui/shell/iconReset', () => ({ useIconReset: () => undefined }));
jest.mock('@/ui/player/DataPrompt', () => ({ DataPrompt: mockNothing }));

const draw = (): ReactTestRenderer => {
  const RootLayout = require('../app/_layout').default as () => React.ReactElement;
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(RootLayout)); });
  return r;
};
/** Every component above `node`, nearest first. */
const ancestors = (node: ReactTestInstance): unknown[] => {
  const out: unknown[] = [];
  for (let n = node.parent; n; n = n.parent) out.push(n.type);
  return out;
};
const only = (r: ReactTestRenderer, type: unknown): ReactTestInstance => {
  const found = r.root.findAll((n) => n.type === type);
  expect(found).toHaveLength(1);
  return found[0]!;
};

it('the root draws, and what the overlay portal draws reaches every data provider', () => {
  const r = draw();
  expect(r.root.findAll((n) => n.props['testID'] === 'overlay-portal')).toHaveLength(1);
});

it.each([
  ['AppProviders', '@/ui/shell/providers'],
  ['SocialProvider', '@/social/context'],
  ['SafetyProvider', '@/safety/context'],
  ['GraphProvider', '@/graph/context'],
])('the overlay provider sits inside %s', (outer, from) => {
  const r = draw();
  const overlay = only(r, require('@/ui/lib/gluestack-ui-provider').GluestackUIProvider);
  expect(ancestors(overlay)).toContain(require(from)[outer]);
});

it('one playlist sheet: inside the data providers, around the stack (the mini player reaches it)', () => {
  const r = draw();
  const host = only(r, require('@/ui/queue/QueueSheetHost').QueueSheetHost);
  expect(ancestors(host)).toContain(require('@/ui/shell/providers').AppProviders);
  expect(r.root.findAll((n) => n.props['testID'] === 'queue-sheet')).toHaveLength(1);
  // The stack (and the root mini player in it) is drawn inside the host.
  const mini = r.root.findAll((n) => n.props['testID'] === 'mini-player' && typeof n.type === 'string');
  expect(mini).toHaveLength(1);
  expect(ancestors(mini[0]!)).toContain(host.type);
});
