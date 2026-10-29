// C2 (T032): the profile screen reads the local database once per profile load, not on every render.
/**
 * Break that turns it red: in app/profile/[id].tsx read `listeningHistory(stores, 5)` /
 * `mockStores.subscriptions.list()` / `mockStores.feeds.getShow` straight in the render body again.
 */
import { createElement, useEffect as mockUseEffect } from 'react';
import { act, create } from 'react-test-renderer';

const mockReads = { history: jest.fn(() => []), totals: jest.fn(() => ({ listenedMs: 0, finished: 0 })), stickers: jest.fn(() => []), subs: jest.fn(() => []), show: jest.fn(() => undefined) };
const mockStores = { subscriptions: { list: mockReads.subs }, feeds: { getShow: mockReads.show }, settings: {} };
const mockProfile = { id: 'me', displayName: 'Me', avatarUrl: null, following: 1, followers: 2, suspended: false, stats: { all: { listenedMs: 5, finished: 1, topShows: [] } }, recent: [{ kind: 'played', createdAt: '2026-10-01T00:00:00Z', finished: false, episode: { id: 'e', title: 'E', feedUrl: 'https://f/a.xml' } }] };

const mockApis = {
  social: { listener: { listenerId: 'me' }, api: { profile: async () => mockProfile } },
  us8: { listenerSubscriptions: async () => ({ private: false, items: [] }) },
  prof: { listenerLikes: async () => ({ items: [] }) },
  m19: { listenerPlaylists: async () => [] },
  extras: { mutes: async () => [] },
  colours: { text: '#000' },
  toast: () => undefined,
  confirm: [() => undefined, null] as const,
  safety: { safety: { isBlocked: () => false, isHidden: () => false }, version: 0, feed: undefined },
};
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({ id: 'me' }), useFocusEffect: (cb: () => void | (() => void)) => { mockUseEffect(cb, [cb]); } }));
jest.mock('@/me/history', () => ({ listeningHistory: () => mockReads.history(), localTotals: () => mockReads.totals() }));
jest.mock('@/me/my-stickers', () => ({ myTotals: () => mockReads.totals(), myStickers: () => mockReads.stickers(), theirStickers: () => [] }));
jest.mock('@/me/stickers', () => ({ latestEarned: () => undefined }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockApis.toast }));
jest.mock('@/ui/kit/useColours', () => ({ useColours: () => mockApis.colours }));
jest.mock('@/social/context', () => ({ useSocial: () => mockApis.social }));
jest.mock('@/safety/context', () => ({ announce: jest.fn(), useSafety: () => mockApis.safety }));
jest.mock('@/social/us8-api', () => ({ useUs8Api: () => mockApis.us8 }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockApis.prof }));
jest.mock('@/social/m19-api', () => ({ useM19Api: () => mockApis.m19 }));
jest.mock('@/social/comment-extras-api', () => ({ useCommentExtrasApi: () => mockApis.extras }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => mockApis }));
jest.mock('@/ui/kit/confirm', () => ({ useConfirm: () => mockApis.confirm }));
jest.mock('@/ui/lib/actionsheet', () => { const N = () => null; return { Actionsheet: N, ActionsheetBackdrop: N, ActionsheetContent: N, ActionsheetDragIndicator: N, ActionsheetDragIndicatorWrapper: N }; });
jest.mock('@/design/tailwind', () => ({ Link: () => null }));
// D-C: the page is a PushedPage; here it only hands its layout to the content.
jest.mock('@/ui/kit/PushedPage', () => ({ PushedPage: (p: { children: unknown }) => (typeof p.children === 'function' ? Reflect.apply(p.children as never, undefined, [{ top: 0, titleBottom: 40, reserve: 100 }]) : p.children) }));
jest.mock('@/ui/lib/scroll-view', () => ({ ScrollView: (p: { children?: unknown }) => p.children ?? null }));
for (const m of ['@/ui/kit/TopBar', '@/ui/me/PlusCard', '@/ui/kit/Icon', '@/ui/kit/Loader', '@/ui/social/FollowButton', '@/ui/social/BlockButton', '@/ui/kit/Artwork', '@/ui/kit/PageHeader', '@/ui/social/RecentCard', '@/ui/comments/Placeholder', '@/ui/comments/ReportSheet', '@/ui/kit/EmptyState', '@/ui/social/ProfileStatRow', '@/ui/kit/Avatar', '@/ui/social/LikeCard', '@/ui/me/PlaylistCard', '@/ui/me/StickerLayer', '@/ui/social/OftenListened', '@/ui/me/country', '@/ui/social/StatsBlock', '@/ui/profile/ProfilePage', '@/ui/discover/Deck', '@/ui/profile/parts', '@/ui/profile/StickerDisc', '@/ui/comments/MenuRows', '@/ui/kit/ActionSheet', '@/ui/kit/PulseButton', '@/ui/kit/PageHeader', '@/ui/kit/Type', '@/ui/me/lists', '@/ui/comments/Spine', '@/ui/kit/EmptyState']) {
  jest.doMock(m, () => new Proxy({}, { get: (_t, k) => (k === '__esModule' ? true : k === 'listenedLabel' ? () => ({ value: '0', spoken: '0' }) : k === 'hms' || k === 'countryName' ? () => '' : () => null) }));
}


it('re-rendering for unrelated state does not touch the local database again', async () => {
  const ProfileScreen = (require('../app/profile/[id]') as { default: React.ComponentType }).default;
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(createElement(ProfileScreen)); });
  await act(async () => { await Promise.resolve(); });
  const before = { h: mockReads.history.mock.calls.length, s: mockReads.subs.mock.calls.length, st: mockReads.stickers.mock.calls.length, t: mockReads.totals.mock.calls.length, g: mockReads.show.mock.calls.length };
  expect(before.h).toBeGreaterThan(0); // it did read, for the mockProfile that loaded
  // An unrelated render (the collapse flag flips on scroll).
  const scroll = r.root.findAll((n) => typeof n.props['onScroll'] === 'function')[0];
  expect(scroll).toBeDefined();
  await act(async () => { scroll!.props['onScroll']({ nativeEvent: { contentOffset: { y: 400 } } }); });
  await act(async () => { scroll!.props['onScroll']({ nativeEvent: { contentOffset: { y: 0 } } }); });
  expect(mockReads.history.mock.calls.length).toBe(before.h);
  expect(mockReads.subs.mock.calls.length).toBe(before.s);
  expect(mockReads.stickers.mock.calls.length).toBe(before.st);
  expect(mockReads.totals.mock.calls.length).toBe(before.t);
  expect(mockReads.show.mock.calls.length).toBe(before.g);
});
