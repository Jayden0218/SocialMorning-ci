// Pins every place the Me tab can open, so a redesign of the page cannot silently drop one.
/**
 * Pinned on the 038 tip 9d2078a, spec 039 D2 (US2). Layout-agnostic: the page is rendered, every control that has an
 * onPress is pressed (once per distinct handler), and the router call is recorded. Links are made pressable by the mock
 * below, so a `<Link href>` and a `router.push` count the same. The pinned list is the path pattern (`/profile/[id]`),
 * not the params. Signed in with the store on (PLUS banner, Wallet row) and signed out (Sign in) are both rendered.
 * Break to watch red: remove one tile or row from app/(tabs)/me.tsx.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
let mockStoreReady = true;
let mockListener: { listenerId: string; displayName: string } | undefined = { listenerId: 'me', displayName: 'Mei Lin' };
const mockStores = {
  settings: { get: (k: string) => (k === 'store.ready' && mockStoreReady ? '1' : undefined), set: () => undefined },
  feedCache: {},
};
const mockFeed = { unread: () => 4, cached: () => undefined };
jest.mock('expo-router', () => {
  const { cloneElement: clone, isValidElement: valid, createElement: make } = require('react');
  const { Pressable } = require('react-native');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: (...a: unknown[]) => mockPush(...a), canGoBack: () => false },
    useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
    Link: ({ href, children, asChild }: { href: unknown; children: unknown; asChild?: boolean }) =>
      (asChild && valid(children) ? clone(children as never, { onPress: () => mockPush(href) }) : make(Pressable, { onPress: () => mockPush(href) }, children)),
    useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
    useScrollToTop: () => undefined,
  };
});
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: mockListener }) }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => ({ me: () => new Promise(() => undefined) }) }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/me/moments', () => ({ listMoments: () => [1, 2, 3] }));
jest.mock('@/graph/feed', () => ({ createFeed: () => mockFeed }));
jest.mock('@/social/m19-api', () => ({ lastMonth: () => '2026-09', monthName: () => 'September' }));
jest.mock('@/playback/store', () => ({ ...jest.requireActual('@/playback/store'), usePlayerSelector: () => true }));
jest.mock('@/ui/lib/alert-dialog', () => ({ AlertDialog: () => null }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import MeScreen from '../../../../app/(tabs)/me';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => { setReducedMotionForTest(true); mockPush.mockClear(); mockStoreReady = true; mockListener = { listenerId: 'me', displayName: 'Mei Lin' }; });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });

const target = (a: unknown): string => {
  if (typeof a === 'string') return a;
  const o = a as { pathname?: string };
  return o.pathname ?? JSON.stringify(a);
};

/** Render, press every distinct onPress handler on the page, return the paths pushed. */
async function reach(): Promise<Set<string>> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(MeScreen)); await Promise.resolve(); });
  mounted.push(r);
  const handlers = new Set<() => void>();
  r.root.findAll((n: ReactTestInstance) => typeof n.props['onPress'] === 'function').forEach((n) => handlers.add(n.props['onPress']));
  const seen = new Set<string>();
  for (const h of handlers) {
    mockPush.mockClear();
    try { await act(async () => { h(); await Promise.resolve(); }); } catch { /* a handler that needs a device does nothing here */ }
    mockPush.mock.calls.forEach((c) => seen.add(target(c[0])));
  }
  return seen;
}

it('Me: signed in, store on, then signed out, then store off: the places it can open', async () => {
  const all = new Set<string>();
  (await reach()).forEach((t) => all.add(t));
  mockListener = undefined;
  (await reach()).forEach((t) => all.add(t));
  mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
  mockStoreReady = false;
  (await reach()).forEach((t) => all.add(t));
  // Pinned on the 038 tip 9d2078a, spec 039 D2.
  expect([...all].sort()).toEqual([
    '/account',
    '/auth/sign-in',
    '/creator',
    '/downloads',
    '/favourites',
    '/history',
    '/likes',
    '/moments',
    '/my-comments',
    '/notifications',
    '/playlists',
    '/profile/[id]',
    '/queue',
    '/report/[month]',
    '/settings/feedback',
    '/stickers',
    '/tips',
    '/wallet',
  ]);
}, 60_000);
