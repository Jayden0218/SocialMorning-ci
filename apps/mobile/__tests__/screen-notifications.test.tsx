// Renders Notifications with real stores and the real feed: sign-in prompt, People feed by day, Interactions, Mute.
/**
 * M32 T060 (review F1). Break to watch red: throw in `NotificationsScreen`; make `open` push the
 * wrong path; make `muteMenu` skip `m22.muteThread`; drop `api.list()` from `Interactions.load`.
 */
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import { allText, hash, mount, press } from './support/screen-kit';
import { createMemoryStores } from '@/storage/memory';

const mockRef: { stores: ReturnType<typeof createMemoryStores>; listener: { listenerId: string } | undefined } = { stores: undefined as never, listener: undefined };
const mockRouter = { push: jest.fn() };
const mockToast = jest.fn();
const NOW = new Date();
const item = (id: number, kind: 'listened' | 'commented', name: string, title: string, momentMs: number | null) => ({
  id, kind, actor: { id: `u${id}`, displayName: name, avatarUrl: null },
  episode: { id: `e${id}`, title, showTitle: 'Night Shift', imageUrl: null },
  momentMs, refId: null, createdAt: NOW.toISOString(),
});
const mockFeedApi = jest.fn(() => Promise.resolve({
  status: 200 as const, etag: 'x',
  body: { serverTime: NOW.toISOString(), items: [item(1, 'commented', 'Bea', 'The salt episode', 83_000), item(2, 'listened', 'Cal', 'Rain sounds', null)] },
}));
const mockNotif = {
  list: jest.fn(() => Promise.resolve({
    next: null,
    items: [
      { id: 'n1', kind: 'reply', actor: { id: 'u9', name: 'Dee', avatarUrl: null }, ref: { commentId: 'c9', parentId: 'c1', excerpt: 'Agree with you', episodeTitle: 'The salt episode' }, createdAt: NOW.toISOString(), unread: true },
      { id: 'n2', kind: 'follow', actor: { id: 'u8', name: 'Eli', avatarUrl: null }, ref: {}, createdAt: NOW.toISOString(), unread: false },
    ],
  })),
  markSeen: jest.fn(() => Promise.resolve()),
};
const mockM22 = { muteThread: jest.fn(() => Promise.resolve()) };
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('expo-router', () => {
  const { useEffect, createElement } = require('react');
  const { Text } = require('react-native');
  return { usePathname: () => '/', useIsFocused: () => true,  Link: (p: { children?: unknown }) => createElement(Text, null, p.children), get router() { return mockRouter; }, useFocusEffect: (f: () => void | (() => void)) => { useEffect(() => f(), [f]); } };
});
const mockApi = { feed: mockFeedApi };
// One object per render pass: a new `api` each render would rebuild the feed and re-run the page's effects for ever.
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi, listener: mockRef.listener }) }));
const mockSafety = { feed: (items: unknown[]) => items };
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useToast: () => mockToast }));
jest.mock('@/social/notifications-api', () => {
  const actual = jest.requireActual('@/social/notifications-api');
  return { ...actual, useNotificationsApi: () => mockNotif };
});
jest.mock('@/social/api-m22-social', () => {
  const actual = jest.requireActual('@/social/api-m22-social');
  return { ...actual, useM22SocialApi: () => mockM22 };
});
jest.mock('@/ui/lib/actionsheet', () => {
  const pass = ({ children }: { children?: unknown }) => children ?? null;
  return {
    Actionsheet: ({ isOpen, children }: { isOpen: boolean; children: unknown }) => (isOpen ? children : null),
    ActionsheetBackdrop: () => null, ActionsheetContent: pass, ActionsheetDragIndicator: () => null, ActionsheetDragIndicatorWrapper: () => null,
  };
});

// The loading mark and pull-to-refresh run native animation loops that outlive the test.
jest.mock('@/ui/kit/Loader', () => ({ Loader: () => null }));
jest.mock('@/ui/kit/PullRefresh', () => ({
  usePullRefresh: () => ({ backdrop: null, inline: null, refreshControl: undefined, onScroll: undefined, scrollEventThrottle: 16 }),
}));

import NotificationsScreen from '../app/notifications';

beforeEach(() => {
  mockRef.stores = createMemoryStores(hash);
  mockRef.listener = { listenerId: 'me' };
  mockRouter.push.mockClear(); mockToast.mockClear(); mockM22.muteThread.mockClear(); mockNotif.list.mockClear();
});

it('signed out: People says to sign in', async () => {
  mockRef.listener = undefined;
  const r = await mount(createElement(NotificationsScreen));
  const t = allText(r);
  expect(t).toContain('Notifications');
  expect(t).toContain('Sign in to follow people and see what they listen to.');
});

it('People: the feed under "Today", and a row opens its episode at the moment', async () => {
  const r = await mount(createElement(NotificationsScreen));
  const t = allText(r);
  expect(t).toContain('TODAY');
  expect(t).toContain('Bea');
  expect(t).toContain('The salt episode');
  expect(t).toContain('Rain sounds');
  await press(r, /^Bea commented at 1:23 on The salt episode/);
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'e1', at: '83000' } });
});

it('Interactions: lists replies and follows, marks them seen, opens the thread', async () => {
  const r = await mount(createElement(NotificationsScreen));
  await press(r, /^Interactions\./);
  const t = allText(r);
  expect(t).toContain('Dee');
  expect(t).toContain('replied to your comment');
  expect(t).toContain('Agree with you');
  expect(t).toContain('Eli');
  expect(t).toContain('started following you');
  expect(mockNotif.markSeen).toHaveBeenCalled();
  await press(r, /^New\. Dee replied to your comment/);
  expect(mockRouter.push).toHaveBeenCalled();
  expect(JSON.stringify(mockRouter.push.mock.calls[0])).toContain('c1');
});

it('Interactions: ⋯ then "Mute this" mutes the thread and says so; a follow has no ⋯', async () => {
  const r = await mount(createElement(NotificationsScreen));
  await press(r, /^Interactions\./);
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'More for Eli started following you').length).toBe(0);
  await press(r, 'More for Dee replied to your comment');
  await press(r, 'Mute this');
  await act(async () => { await Promise.resolve(); });
  expect(mockM22.muteThread).toHaveBeenCalledWith({ threadKind: 'comment', threadKey: 'c1' });
  expect(mockToast).toHaveBeenCalledWith('Muted. No more notices from this thread.');
});
