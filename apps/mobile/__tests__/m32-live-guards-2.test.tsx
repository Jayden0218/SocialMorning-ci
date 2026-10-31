// T090: more async effects stop at unmount — a late answer changes nothing and calls nothing.
/**
 * Break that turns each red: remove the `mounted` check in `Interactions.load` (app/notifications.tsx)
 * or in InterestsGate.tsx (the `mounted.current &&` before router.push).
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { allText, hash, mount, pressText } from './support/screen-kit';
import { createMemoryStores } from '@/storage/memory';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };

const mockRef: { stores: ReturnType<typeof createMemoryStores> } = { stores: undefined as never };
const mockRouter = { push: jest.fn() };
const mockList = { pending: undefined as unknown as Deferred<{ items: unknown[]; next: null }> };
const mockNotif = { list: jest.fn(() => mockList.pending.promise), markSeen: jest.fn(() => Promise.resolve()) };
const mockInterests = { pending: undefined as unknown as Deferred<{ genreIds: number[] }> };
const mockDiscover = { interests: jest.fn(() => mockInterests.pending.promise), setInterests: jest.fn() };
const mockSocial = { api: { feed: jest.fn(() => Promise.resolve({ status: 304 })) }, listener: { listenerId: 'me' } };

jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { usePathname: () => '/', useIsFocused: () => true,  Link: () => null, get router() { return mockRouter; }, useFocusEffect: (f: () => void | (() => void)) => { useEffect(() => f(), [f]); } };
});
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ feed: (i: unknown[]) => i }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useToast: () => jest.fn() }));
jest.mock('@/social/notifications-api', () => ({ ...jest.requireActual('@/social/notifications-api'), useNotificationsApi: () => mockNotif }));
jest.mock('@/social/api-m22-social', () => ({ ...jest.requireActual('@/social/api-m22-social'), useM22SocialApi: () => ({ muteThread: jest.fn() }) }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => mockDiscover }));
jest.mock('@/ui/lib/actionsheet', () => ({
  Actionsheet: () => null, ActionsheetBackdrop: () => null, ActionsheetContent: () => null, ActionsheetDragIndicator: () => null, ActionsheetDragIndicatorWrapper: () => null,
}));
jest.mock('@/ui/kit/Loader', () => ({ Loader: () => null }));
jest.mock('@/ui/kit/PullRefresh', () => ({
  usePullRefresh: () => ({ backdrop: null, inline: null, refreshControl: undefined, onScroll: undefined, scrollEventThrottle: 16 }),
}));

beforeEach(() => {
  mockRef.stores = createMemoryStores(hash);
  mockRouter.push.mockClear(); mockNotif.markSeen.mockClear(); mockNotif.list.mockClear();
});

it('Notifications: an Interactions answer that arrives after leaving does not mark anything seen', async () => {
  const Notifications = (require('../app/notifications') as { default: React.ComponentType }).default;
  mockList.pending = deferred();
  const r = await mount(createElement(Notifications));
  await pressText(r, 'Interactions');
  expect(mockNotif.list).toHaveBeenCalled();
  expect(allText(r)).not.toContain('Dee');
  await act(async () => { r.unmount(); });
  mockList.pending.resolve({ next: null, items: [{ id: 'n1', kind: 'follow', actor: { id: 'u', name: 'Dee', avatarUrl: null }, ref: {}, createdAt: new Date().toISOString(), unread: true }] });
  await flush();
  expect(mockNotif.markSeen).not.toHaveBeenCalled();
});

it('InterestsGate: a late answer after unmount does not open the interests page', async () => {
  const { InterestsGate } = require('@/ui/discover/InterestsGate') as typeof import('@/ui/discover/InterestsGate');
  mockInterests.pending = deferred();
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(createElement(InterestsGate, { onTabs: true })); });
  expect(mockDiscover.interests).toHaveBeenCalled();
  await act(async () => { r.unmount(); });
  mockInterests.pending.resolve({ genreIds: [] });
  await flush();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

it('InterestsGate (control): still opens the page when it stays mounted', async () => {
  const { InterestsGate } = require('@/ui/discover/InterestsGate') as typeof import('@/ui/discover/InterestsGate');
  mockInterests.pending = deferred();
  await act(async () => { create(createElement(InterestsGate, { onTabs: true })); });
  mockInterests.pending.resolve({ genreIds: [] });
  await flush();
  expect(mockRouter.push).toHaveBeenCalledWith('/onboarding/interests');
});
