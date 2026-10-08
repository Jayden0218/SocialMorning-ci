// Renders the root layout and checks what it hands down: safe-area padding once, the insets to UniWind, the rate sheet's props.
/**
 * M25 lane GB: the root-layout halves of three guards, once source scans of app/_layout.tsx,
 * now checked on the rendered layout (every provider and sheet in it is stubbed; the
 * SafeAreaView, the listener hand-off and the props are the real code).
 *
 *  - M12 guard G-T1 (NEW-5, with __tests__/no-double-inset.test.ts): each safe-area edge is padded
 *    ONCE. A screen's own SafeAreaView under the root adds up to exactly the top inset and the
 *    bottom inset — not twice (the ~60 pt empty band under the status bar, iPhone 2026-09-29).
 *    On the player the root pads nothing (the page paints its own bar to the edge, 2026-10-06).
 *    The break that turns it red: drop `edges={…['bottom']}` from the root SafeAreaView in
 *    app/_layout.tsx (top counted twice, bottom never), or add 'bottom' to SCREEN_EDGES.
 *  - M16a guard G-S1 (with __tests__/sheet-safe-area.test.ts): the root hands the device insets to
 *    UniWind, which is what gives every sheet's `pb-safe` its value. The break that turns it red:
 *    remove the <SafeAreaListener onChange={…Uniwind.updateInsets…}> around the app.
 *  - Defect 1 of 2026-10-07 (with __tests__/iphone-1007.test.tsx): the rate sheet is given the
 *    page segment and the consent. The break: stop passing `segment` or `consent` to <RateSheet>.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

// jest.mock factories are hoisted, so anything they touch must be named `mock*`.
const mockInsets = { top: 59, bottom: 34, left: 0, right: 0 };
const mockRoute: { path: string; segment: string | undefined } = { path: '/', segment: '(tabs)' };
const mockRateSheet = jest.fn();
const mockConsent = { value: true };
const mockSettings = { get: () => undefined, set: () => undefined, delete: () => undefined };

jest.mock('../global.css', () => ({}));
jest.mock('@/design/tailwind', () => ({}));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: () => Promise.resolve(true), hideAsync: () => Promise.resolve(true) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: (p: { children?: unknown }) => p.children }));
// The stack draws one screen: a page with its own SafeAreaView (default edges), as every self-headed page has.
jest.mock('expo-router', () => {
  const { createElement: h } = require('react');
  const Stack = (): unknown => h(require('@/ui/lib/safe-area-view').SafeAreaView, { testID: 'screen' });
  Stack.Screen = (): null => null;
  return { Stack, usePathname: () => mockRoute.path, useSegments: () => [mockRoute.segment], router: { push: jest.fn(), back: jest.fn() } };
});
// The listener reports the device insets once mounted, as the native one does.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context') as Record<string, unknown>;
  const { useEffect } = require('react');
  return {
    ...actual,
    SafeAreaListener: (p: { onChange: (e: unknown) => void; children?: unknown }) => {
      useEffect(() => { p.onChange({ insets: mockInsets, frame: { x: 0, y: 0, width: 430, height: 932 } }); }, []);
      return p.children;
    },
  };
});
jest.mock('@/ui/shell/providers', () => ({
  AppProviders: (p: { children?: unknown }) => p.children,
  useStores: () => ({ settings: mockSettings, auth: { get: () => undefined }, feedCache: {} }),
  useToast: () => () => undefined,
  useCovered: () => false,
}));
jest.mock('@/social/context', () => ({ SocialProvider: (p: { children?: unknown }) => p.children }));
jest.mock('@/safety/context', () => ({ SafetyProvider: (p: { children?: unknown }) => p.children }));
jest.mock('@/graph/context', () => ({ GraphProvider: (p: { children?: unknown }) => p.children }));
jest.mock('@/ui/lib/gluestack-ui-provider', () => ({ GluestackUIProvider: (p: { children?: unknown }) => p.children }));
jest.mock('@/ui/queue/QueueSheetHost', () => ({ QueueSheetHost: (p: { children?: unknown }) => p.children }));
jest.mock('@/playback/store', () => ({ usePlayerSelector: (f: (s: { kind: string }) => unknown) => f({ kind: 'idle' }) }));
jest.mock('@/telemetry/reportError', () => ({ reportError: () => undefined, reportAndDrop: () => () => undefined }));
jest.mock('@/outside/CarLibrarySync', () => ({ CarLibrarySync: () => null }));
jest.mock('@/ui/player/MiniPlayer', () => ({ MiniPlayer: () => null, miniPlayerShows: () => false }));
jest.mock('@/ui/shell/RateSheet', () => ({ RateSheet: (p: unknown) => { mockRateSheet(p); return null; } }));
jest.mock('@/ui/auth/PendingDeletion', () => ({ PendingDeletionSheet: () => null }));
jest.mock('@/ui/shell/consent', () => ({ consentGiven: () => mockConsent.value }));
jest.mock('@/ui/discover/InterestsGate', () => ({ InterestsGate: () => null }));
jest.mock('@/ui/shell/startupExtras', () => ({ useStartupExtras: () => undefined }));
jest.mock('@/config/useStartConfig', () => ({ useStartConfig: () => undefined }));
jest.mock('@/ui/shell/iconReset', () => ({ useIconReset: () => undefined }));
jest.mock('@/ui/player/DataPrompt', () => ({ DataPrompt: () => null }));

import RootLayout from '../app/_layout';

function render(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: mockInsets }, createElement(RootLayout))); });
  return r;
}

/** The padding on one side added up over a node and every host view above it. */
function padded(node: ReactTestInstance, key: 'paddingTop' | 'paddingBottom' | 'paddingLeft' | 'paddingRight'): number {
  let sum = 0;
  for (let n: ReactTestInstance | null = node; n !== null; n = n.parent) {
    if (typeof n.type !== 'string') continue;
    const s = (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
    sum += Number(s[key] ?? 0);
  }
  return sum;
}
const screen = (r: ReactTestRenderer): ReactTestInstance => r.root.find((n) => typeof n.type === 'string' && n.props['testID'] === 'screen');
/** The outermost host view: the root SafeAreaView. */
const rootView = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => typeof n.type === 'string')[0]!;
const own = (n: ReactTestInstance) => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;

beforeEach(() => { mockRoute.path = '/'; mockRoute.segment = '(tabs)'; mockConsent.value = true; mockRateSheet.mockClear(); });

describe('G-T1: each safe-area edge is padded once', () => {
  it('a page under the root: the top inset once (the page), the bottom inset once (the root)', () => {
    const r = render();
    const page = screen(r);
    expect(padded(page, 'paddingTop')).toBe(mockInsets.top);
    expect(padded(page, 'paddingBottom')).toBe(mockInsets.bottom);
    // Who pads what: the root only the bottom, the page only its top (and sides).
    expect(own(rootView(r))['paddingBottom']).toBe(mockInsets.bottom);
    expect(own(rootView(r))['paddingTop'] ?? 0).toBe(0);
    expect(own(page)['paddingTop']).toBe(mockInsets.top);
    expect(own(page)['paddingBottom'] ?? 0).toBe(0);
    act(() => r.unmount());
  });

  it('on the player the root pads no edge (the page paints its own bar to the bottom)', () => {
    mockRoute.path = '/player';
    mockRoute.segment = 'player';
    const r = render();
    const root = own(rootView(r));
    expect(root['paddingBottom'] ?? 0).toBe(0);
    expect(root['paddingTop'] ?? 0).toBe(0);
    expect(padded(screen(r), 'paddingTop')).toBe(mockInsets.top);
    act(() => r.unmount());
  });
});

describe('G-S1: the root hands the device insets to UniWind', () => {
  it('the safe-area listener\'s insets reach Uniwind.updateInsets', () => {
    const spy = jest.spyOn(Uniwind, 'updateInsets');
    const r = render();
    expect(spy).toHaveBeenCalledWith(mockInsets);
    act(() => r.unmount());
    spy.mockRestore();
  });
});

describe('defect 1 (2026-10-07): the rate sheet knows the page and the consent', () => {
  it('on the tabs with the terms agreed', () => {
    const r = render();
    expect(mockRateSheet).toHaveBeenLastCalledWith({ onTabs: true, segment: '(tabs)', consent: true });
    act(() => r.unmount());
  });
  it('on an onboarding page before the terms', () => {
    mockRoute.segment = 'onboarding';
    mockRoute.path = '/onboarding/interests';
    mockConsent.value = false;
    const r = render();
    expect(mockRateSheet).toHaveBeenLastCalledWith({ onTabs: false, segment: 'onboarding', consent: false });
    act(() => r.unmount());
  });
});
