// Spec 039 T017 (US1, M4): Discover is a Page of Sections and Shelves with a hero drawn from the first moment.
/**
 * Written BEFORE the rebuild (red): the hero is the FIRST item of the moments feed (title and time) and is not drawn when there are none;
 * the page is a `Page` titled "Discover" with a Search button; every section heading is a `Section`; every horizontal list is a `Shelf`
 * (no `Deck`); no `EdgeLabel` anywhere. Break to watch red: draw `hottest(items)` instead of `items[0]`, or put one section back on `DeckSection`.
 */
import { createRef, createElement } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SWITCH_HEIGHT, SWITCH_LIFT } from '@/ui/discover/HomeSwitch';
import { bars } from '@/design';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
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
async function render(m: MomentsList, p: DiscoverPageData = page()): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(DiscoverPage, { page: p, moments: m })); await Promise.resolve(); });
  mounted.push(r);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
}
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string');
const words = (r: ReactTestRenderer): string[] => r.root.findAll((n) => (n.type as unknown) === Text).map((x) => [x.props['children']].flat(5).join(''));
const FIRST: Moment = { episodeId: 'm1', showTitle: 'Journey Morning', episodeTitle: 'First moment ep', startMs: 43_000, endMs: 60_000, reactions: 3, rank: 2, followed: false, comments: [] };
const HOTTER: Moment = { ...FIRST, episodeId: 'm2', episodeTitle: 'Hotter moment ep', startMs: 872_000, endMs: 910_000, reactions: 99, rank: 1 };

describe('Discover on the layout parts', () => {
  it('draws the hero from the FIRST moment (its title, time and show), not the hottest', async () => {
    const r = await render({ ...moments, items: [FIRST, HOTTER] });
    const hero = byId(r, 'discover-hero');
    expect(hero).toHaveLength(1);
    const inside = words({ root: hero[0]! } as unknown as ReactTestRenderer);
    expect(inside).toEqual(expect.arrayContaining(['First moment ep', '0:43']));
    expect(inside.join('|')).toContain('Journey Morning');
    expect(inside.join('|')).not.toContain('Hotter moment ep');
    expect(inside.join('|')).toMatch(/Moment of the day/i);
  });

  it('draws no hero, and no empty card, when there are no moments', async () => {
    const r = await render({ ...moments, items: [] });
    expect(byId(r, 'discover-hero')).toHaveLength(0);
    expect(words(r).join('|')).not.toMatch(/Moment of the day/i);
  });

  it('the hero plays from the moment', async () => {
    const r = await render({ ...moments, items: [FIRST] });
    const play = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && n.props['accessibilityLabel'] === 'Play from 0:43')[0]!;
    mockPush.mockClear();
    await act(async () => { play.props['onPress'](); await Promise.resolve(); });
    expect(mockPush).toHaveBeenCalledWith('page.playFull');
  });

  it('is a Page titled Discover with a Search button that calls openSearch', async () => {
    const p = page();
    const r = await render(moments, p);
    expect(byId(r, 'page-scroll')).toHaveLength(1);
    const title = r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && [n.props['children']].flat(5).join('') === 'Discover');
    expect(title.length).toBeGreaterThan(0);
    const search = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && n.props['accessibilityLabel'] === 'Search')[0]!;
    mockPush.mockClear();
    await act(async () => { search.props['onPress'](); await Promise.resolve(); });
    expect(mockPush).toHaveBeenCalledWith('page.openSearch');
  });

  it('every section heading is a Section, every horizontal list is a Shelf, and nothing is a Deck or an EdgeLabel', async () => {
    const r = await render(moments);
    const sections = byId(r, 'section');
    expect(sections.length).toBeGreaterThanOrEqual(10);
    for (const s of sections) expect(s.findAll((n) => n.props['accessibilityRole'] === 'header').length).toBeGreaterThan(0);
    expect(byId(r, 'shelf').length).toBeGreaterThanOrEqual(8);
    expect(byId(r, 'deck')).toHaveLength(0);
    expect(r.root.findAllByType(EdgeLabel)).toHaveLength(0);
  });

  it('clears the Moments | Discover switch at the foot', async () => {
    const r = await render(moments);
    const scroll = byId(r, 'page-scroll')[0]!;
    const kids = scroll.findAll((n) => typeof n.type === 'string' && (StyleSheet.flatten(n.props['style']) as { height?: number } | undefined)?.height === SWITCH_LIFT + SWITCH_HEIGHT);
    expect(kids.length).toBeGreaterThan(0);
  });

  it("the page's foot padding itself includes the switch's height and lift on top of the tab bar (the For You card titles were covered, run 42025749074)", async () => {
    const r = await render(moments);
    const scroll = byId(r, 'page-scroll')[0]!;
    const pad = Number((StyleSheet.flatten(scroll.props['contentContainerStyle']) as { paddingBottom?: number }).paddingBottom);
    expect(pad).toBeGreaterThanOrEqual(bars.tab + SWITCH_LIFT + SWITCH_HEIGHT);
  });

  it('keeps the shortcut tiles in a 2-column grid', async () => {
    const r = await render(moments);
    expect(byId(r, 'tile-grid').length).toBeGreaterThan(0);
  });
});
