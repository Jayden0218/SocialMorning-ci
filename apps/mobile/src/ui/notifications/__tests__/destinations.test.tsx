// Pins every place the Notifications page can open, so a redesign of the page cannot silently drop one.
/**
 * Pinned on the 038 tip 9d2078a, spec 039 D2 (US2). Layout-agnostic: the page is rendered signed in with one row of every
 * kind (People: listened, commented, clipped; Interactions: reply, like on an episode, follow, like-post, status),
 * every control with an onPress is pressed once per distinct handler, and the router call is recorded. Both views
 * (People, then Interactions through its switch) and signed out (Sign in) are rendered. Concrete ids are folded back to the
 * route pattern. Break to watch red: remove the System or From hosts card, or the Sign in button.
 */
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { hash, mount } from '../../../../__tests__/support/screen-kit';
import { createMemoryStores } from '@/storage/memory';

const mockRef: { stores: ReturnType<typeof createMemoryStores>; listener: { listenerId: string } | undefined } = { stores: undefined as never, listener: undefined };
const mockPush = jest.fn();
const mockRouter = { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockPush(...a), back: jest.fn() };
const NOW = new Date();
const item = (id: number, kind: 'listened' | 'commented' | 'clipped', name: string, title: string, momentMs: number | null, refId: string | null = null) => ({
  id, kind, actor: { id: `u${id}`, displayName: name, avatarUrl: null },
  episode: { id: `e${id}`, title, showTitle: 'Night Shift', imageUrl: null },
  momentMs, refId, createdAt: NOW.toISOString(),
});
const mockFeedApi = jest.fn(() => Promise.resolve({
  status: 200 as const, etag: 'x',
  body: { serverTime: NOW.toISOString(), items: [item(1, 'commented', 'Bea', 'The salt episode', 83_000), item(2, 'listened', 'Cal', 'Rain sounds', null), item(3, 'clipped', 'Fay', 'A clipped one', 5_000, 'clip9')] },
}));
const notice = (id: string, kind: string, ref: Record<string, unknown>) => ({ id, kind, actor: { id: `a${id}`, name: `Actor${id}`, avatarUrl: null }, ref, createdAt: NOW.toISOString(), unread: true });
const mockNotif = {
  list: jest.fn(() => Promise.resolve({
    next: null,
    items: [
      notice('n1', 'reply', { commentId: 'c9', parentId: 'c1', excerpt: 'Agree', episodeTitle: 'The salt episode' }),
      notice('n2', 'like', { episodeId: 'e7', excerpt: 'Nice', episodeTitle: 'Seven' }),
      notice('n3', 'follow', {}),
      notice('n4', 'like_post_comment', { ownerId: 'o1', episodeId: 'e8', excerpt: 'On your like', episodeTitle: 'Eight' }),
      notice('n5', 'status_reaction', { postId: 'p1', episodeTitle: 'Nine' }),
    ],
  })),
  markSeen: jest.fn(() => Promise.resolve()),
};
const mockM22 = { muteThread: jest.fn(() => Promise.resolve()) };
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('expo-router', () => {
  const { useEffect, createElement: make, cloneElement, isValidElement } = require('react');
  const { Pressable } = require('react-native');
  return {
    usePathname: () => '/', useIsFocused: () => true,
    Link: ({ href, children, asChild }: { href: unknown; children: unknown; asChild?: boolean }) =>
      (asChild && isValidElement(children) ? cloneElement(children, { onPress: () => mockPush(href) }) : make(Pressable, { onPress: () => mockPush(href) }, children)),
    get router() { return mockRouter; },
    useRouter: () => mockRouter,
    useFocusEffect: (f: () => void | (() => void)) => { useEffect(() => f(), [f]); },
  };
});
const mockApi = { feed: mockFeedApi };
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi, listener: mockRef.listener }) }));
const mockSafety = { feed: (items: unknown[]) => items };
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useToast: () => jest.fn() }));
jest.mock('@/social/notifications-api', () => ({ ...jest.requireActual('@/social/notifications-api'), useNotificationsApi: () => mockNotif }));
jest.mock('@/social/api-m22-social', () => ({ ...jest.requireActual('@/social/api-m22-social'), useM22SocialApi: () => mockM22 }));
jest.mock('@/ui/lib/actionsheet', () => {
  const pass = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Actionsheet: ({ isOpen, children }: { isOpen: boolean; children: unknown }) => (isOpen ? children : null),
    ActionsheetBackdrop: () => null, ActionsheetContent: pass, ActionsheetDragIndicator: () => null, ActionsheetDragIndicatorWrapper: () => null,
  };
});
jest.mock('@/ui/kit/Loader', () => ({ Loader: () => null }));
jest.mock('@/ui/kit/PullRefresh', () => ({
  usePullRefresh: () => ({ backdrop: null, inline: null, refreshControl: undefined, onScroll: undefined, scrollEventThrottle: 16 }),
}));

import NotificationsScreen from '../../../../app/notifications';

beforeEach(() => {
  mockRef.stores = createMemoryStores(hash);
  mockRef.listener = { listenerId: 'me' };
  mockPush.mockClear();
});

/** A concrete id folded back to its route pattern, so the pin is about places, not sample data. */
const target = (a: unknown): string => {
  if (typeof a !== 'string') return (a as { pathname?: string }).pathname ?? JSON.stringify(a);
  return a.replace(/^\/like\/[^/]+\/[^/]+$/, '/like/[owner]/[episode]').replace(/^\/status\/[^/]+$/, '/status/[id]');
};

/** Press every distinct onPress handler on the page now; return the places pushed. */
async function pressAll(r: ReactTestRenderer, into: Set<string>): Promise<void> {
  const handlers = new Set<() => void>();
  r.root.findAll((n: ReactTestInstance) => typeof n.props['onPress'] === 'function').forEach((n) => handlers.add(n.props['onPress']));
  for (const h of handlers) {
    mockPush.mockClear();
    try { await act(async () => { h(); await Promise.resolve(); }); } catch { /* a handler that needs a device does nothing here */ }
    mockPush.mock.calls.forEach((c) => into.add(target(c[0])));
  }
}

it('Notifications: the places the page can open', async () => {
  const all = new Set<string>();
  // People, then Interactions through the switch.
  const r = await mount(createElement(NotificationsScreen));
  await pressAll(r, all);
  const sw = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && /^Interactions\./.test(String(n.props['accessibilityLabel'] ?? '')))[0];
  if (!sw) throw new Error('the Interactions switch is gone');
  await act(async () => { sw.props['onPress'](); await Promise.resolve(); });
  await pressAll(r, all);
  act(() => r.unmount());
  // Signed out.
  mockRef.listener = undefined;
  const out = await mount(createElement(NotificationsScreen));
  await pressAll(out, all);
  act(() => out.unmount());
  // Pinned on the 038 tip 9d2078a, spec 039 D2.
  expect([...all].sort()).toEqual([
    '/auth/sign-in',
    '/clip/[id]',
    '/comments/thread/[commentId]',
    '/episode/[id]',
    '/like/[owner]/[episode]',
    '/notifications/hosts',
    '/notifications/system',
    '/profile/[id]',
    '/status/[id]',
  ]);
}, 60_000);
