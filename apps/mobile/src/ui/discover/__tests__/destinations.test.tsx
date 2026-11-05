// Pins every place the Discover page can open, so a redesign of the page cannot silently drop one.
/**
 * Pinned on the 038 tip 9d2078a, spec 039 D2 (US2). Layout-agnostic: DiscoverPage is rendered signed in with every section
 * present and filled, every control with an onPress is pressed once per distinct handler, and the call is recorded.
 * Real router calls are recorded by their path pattern. Where the page hands the act to its owner (`page.open` for an
 * episode, `page.showPage`, `page.allCategories`, `page.openSearch`, the Hot now player) the test's stand-in records a
 * `page.*` name, so dropping the control is still caught. Play and queue buttons start playback or add to the queue and
 * are not places, so they are not pinned; the Premium tile only scrolls the page. Break to watch red: remove one shortcut tile, or the Scan button.
 */
import { createRef, createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { DiscoverPage } from '@/ui/discover/DiscoverPage';
import type { DiscoverPageData } from '@/ui/discover/useDiscoverPage';
import type { MomentsList } from '@/ui/discover/useMoments';
import type { Moment } from '@/discover/moments-api';
import { buildModel } from '@/discover/sections';
import type { Discover, EpisodeCard, ShowCard } from '@/social/api';

jest.mock('react-native-reanimated', () => {
  const { ScrollView, View } = require('react-native');
  return {
    __esModule: true,
    default: { ScrollView, View },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: (v: number, i: number[], o: number[]) => o[v <= i[0]! ? 0 : 1],
    runOnJS: (f: unknown) => f,
    useAnimatedScrollHandler: (h: { onScroll: (e: unknown) => void }) => (e: unknown) => h.onScroll(e),
    useAnimatedStyle: (f: () => object) => f(),
    useSharedValue: (v: number) => ({ value: v }),
  };
});
const mockPush = jest.fn();
const mockRouter = { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockPush(...a), back: jest.fn(), canGoBack: () => false };
jest.mock('expo-router', () => ({
  get router() { return mockRouter; },
  useRouter: () => mockRouter,
  useScrollToTop: () => undefined,
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined }, feedCache: {}, queue: { list: () => [1, 2] } }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: { listenerId: 'me', displayName: 'Mei' } }) }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({ playFull: () => mockPush('page.playFull') }) }));
jest.mock('@/ui/discover/NotInterested', () => ({ NotInterestedSheet: () => null, HiddenNotice: () => null }));
const mockLike = { listener: { id: 'u5', displayName: 'Zed', avatarUrl: null }, episode: { id: 'e5', title: 'Liked one', showTitle: 'S', imageUrl: null }, note: 'good', createdAt: '2026-10-27T00:00:00Z' };
const mockProfile = { likesTimeline: () => Promise.resolve({ items: [mockLike], next: null }) };
jest.mock('@/social/profile-api', () => ({ ...jest.requireActual('@/social/profile-api'), useProfileApi: () => mockProfile }));
const mockHunt = { hunt: () => Promise.resolve({ items: [{ id: 'h9', feedUrl: 'https://f/h9', guid: 'h9', title: 'Hunted', showTitle: 'Obscure', enclosureUrl: 'https://a/h9.mp3' }] }) };
jest.mock('@/discover/explore-api', () => ({ ...jest.requireActual('@/discover/explore-api'), useExploreApi: () => mockHunt }));

const card = (id: string): EpisodeCard => ({ id, feedUrl: `https://f/${id}.xml`, guid: id, title: `Title ${id}`, showTitle: `Show ${id}`, enclosureUrl: `https://a/${id}.mp3` });
const show = (id: string): ShowCard => ({ feedUrl: `https://s/${id}.xml`, title: `Show ${id}`, author: 'A', genres: ['x'] });
const item = (id: string) => ({ kind: 'pick' as const, key: id, episode: card(id), why: 'Because.', stats: { listeners: 3, comments: 1 } });
const BODY: Discover = {
  date: '2026-10-27', picks: [item('p1')], talkedAbout: [item('t1')], trending: [item('r1')], stale: false, serverTime: '2026-10-27T00:00:00Z',
  shows: [show('a'), show('b')], premium: [show('pr')], video: [item('v1')], newArrivals: [{ show: show('n'), episode: card('n1') }],
  newShows: [{ show: show('ns'), episode: card('ns1') }],
  said: [{ commentId: 'c1', authorId: 'u1', body: 'Said this', createdAt: '2026-10-27T00:00:00Z', episode: card('s1') }],
  collections: [{ id: 'col1', title: 'A list', items: [item('l1')] }],
};
const FOR_YOU = { items: [{ episode: card('f1'), channel: 'pick' as const, reason: 'You like it', score: 1 }], computedAt: '2026-10-27T00:00:00Z', stale: false, similarityAge: null, serverTime: '2026-10-27T00:00:00Z' };
const HOT: Moment = { episodeId: 'h1', showTitle: 'S', episodeTitle: 'Hot ep', startMs: 872_000, endMs: 910_000, reactions: 41, rank: 1, followed: false, comments: [] };
const moments: MomentsList = { status: 'ready', items: [HOT], more: false, loadingMore: false, failed: false, refresh: jest.fn(async () => undefined), loadMore: jest.fn(async () => undefined), refreshIfOld: jest.fn() };

function page(): DiscoverPageData {
  const model = buildModel(BODY, FOR_YOU as never, { feeds: new Set(), blocked: new Set() });
  const note = (name: string) => (): void => { mockPush(`page.${name}`); };
  return {
    router: mockRouter, stores: {}, view: { body: BODY, stale: false, fetchedAt: 0 }, refreshing: false, refreshBoth: jest.fn(), queue: jest.fn(), listener: { listenerId: 'me' },
    forYou: {}, outbox: { opened: jest.fn() }, model, hints: ['morning routines'], shown: true,
    act: { onOpen: note('open'), onPlay: jest.fn(), stats: {} }, scroller: createRef(), moreFor: undefined, setMoreFor: jest.fn(), undo: undefined, undoHide: jest.fn(),
    notInterested: jest.fn(), hiddenCats: [], hideCat: jest.fn(), showCat: jest.fn(), showPage: note('showPage'), allCategories: note('allCategories'),
    openSearch: note('openSearch'), open: note('open'),
  } as unknown as DiscoverPageData;
}

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((x) => x.unmount()); }); mockPush.mockClear(); });
/** The test renderer's Views answer `measureInWindow` like laid-out ones (the search field reports where it sits). */
const layOut = (r: ReactTestRenderer): void => {
  for (const n of r.root.findAll((x) => x.instance && typeof (x.instance as { measureInWindow?: unknown }).measureInWindow === 'function')) {
    (n.instance as { measureInWindow: unknown }).measureInWindow = (cb: (x: number, y: number) => void) => cb(0, 640);
  }
};
const target = (a: unknown): string => (typeof a === 'string' ? a : (a as { pathname?: string }).pathname ?? JSON.stringify(a));

it('Discover: the places the page can open', async () => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(DiscoverPage, { page: page(), moments })); await Promise.resolve(); });
  mounted.push(r);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  layOut(r);
  const handlers = new Set<() => void>();
  r.root.findAll((n: ReactTestInstance) => typeof n.props['onPress'] === 'function').forEach((n) => handlers.add(n.props['onPress']));
  expect(handlers.size).toBeGreaterThan(30); // the page really rendered its sections
  const seen = new Set<string>();
  for (const h of handlers) {
    mockPush.mockClear();
    try { await act(async () => { h(); await Promise.resolve(); }); } catch { /* a handler that needs a device does nothing here */ }
    mockPush.mock.calls.forEach((c) => seen.add(target(c[0])));
  }
  // Pinned on the 038 tip 9d2078a, spec 039 D2.
  expect([...seen].sort()).toEqual([
    '/academy',
    '/category/[id]',
    '/chart',
    '/friends-listening',
    '/issues',
    '/like/[owner]/[episode]',
    '/likes',
    '/onboarding/not-liking',
    '/picks/daily',
    '/picks/past',
    '/plaza',
    '/queue',
    '/scan',
    '/topic/[id]',
    'page.allCategories',
    'page.open',
    'page.openSearch',
    'page.playFull',
    'page.showPage',
  ]);
}, 60_000);
