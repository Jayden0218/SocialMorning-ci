// Tests the Discover view of Home as one page: the mosaic, the bottom zone, the loading and offline states, the actions.
/**
 * M31 T025 (design-pulse2 `discover--screen`, `home--loading`, `home--offline`). The sections' own
 * rendering is covered where they were (discover-sections, m24-screens); here the page is checked as
 * the thing that joins them: the first-paint hold, the pinned search field with its trending hint, the
 * Scan button, the tiles, Hot now from the Moments list, the stale notice, and that no collapsing bar
 * is left. The break that turns it red: draw the search field inside the scroll (it would scroll away).
 */
import { createRef, createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { DiscoverPage } from '@/ui/discover/DiscoverPage';
import type { DiscoverPageData } from '@/ui/discover/useDiscoverPage';
import type { MomentsList } from '@/ui/discover/useMoments';
import type { Moment } from '@/discover/moments-api';

// reanimated's native worklets do not load under jest (see sheet-above-modals.test.tsx): a stand-in for what the page uses.
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
const mockScrollToTop = jest.fn();
jest.mock('expo-router', () => ({ useScrollToTop: (r: unknown) => mockScrollToTop(r), useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }), useFocusEffect: () => undefined }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined }, feedCache: {}, queue: { list: () => [] } }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: undefined }) }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
const mockPlayFull = jest.fn();
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({ playFull: mockPlayFull }) }));
jest.mock('@/ui/discover/TheirLikes', () => ({ TheirLikes: () => null }));
jest.mock('@/ui/discover/TreasureHunt', () => ({ TreasureHunt: () => null }));
jest.mock('@/ui/discover/NotInterested', () => ({ NotInterestedSheet: () => null, HiddenNotice: () => null }));
jest.mock('@/ui/discover/RecFeedback', () => ({ RecFeedbackLink: () => null }));

const HOT: Moment = { episodeId: 'h1', showTitle: 'S', episodeTitle: 'Hot ep', startMs: 872_000, endMs: 910_000, reactions: 41, rank: 1, followed: false, comments: [] };
const list = (items: Moment[] = []): MomentsList => ({ status: 'ready', items, more: false, loadingMore: false, failed: false, refresh: jest.fn(async () => undefined), loadMore: jest.fn(async () => undefined), refreshIfOld: jest.fn() });
const PICK = { kind: 'pick', key: 'k', episode: { id: 'e1', feedUrl: 'https://f', guid: 'g', title: 'Pick title', showTitle: 'Show', enclosureUrl: 'https://a.mp3' } };
function page(over: Partial<DiscoverPageData> = {}): DiscoverPageData {
  return {
    router: { push: mockPush }, stores: {}, view: { body: { date: '2026-10-27' }, stale: false, fetchedAt: 0 }, refreshing: false, refreshBoth: jest.fn(), queue: jest.fn(), listener: undefined,
    forYou: {}, outbox: { opened: jest.fn() }, model: { order: [], picks: [PICK], chart: [], forYou: [], pickedShows: [], shows: [], premium: [], video: [], collections: [], said: [], arrivals: [] },
    hints: ['morning routines'], shown: true, act: { onOpen: jest.fn(), onPlay: jest.fn(), stats: {} }, scroller: createRef(), moreFor: undefined, setMoreFor: jest.fn(), undo: undefined, undoHide: jest.fn(),
    notInterested: jest.fn(), hiddenCats: [], hideCat: jest.fn(), showCat: jest.fn(), showPage: jest.fn(), allCategories: jest.fn(), openSearch: jest.fn(), open: jest.fn(),
    ...over,
  } as unknown as DiscoverPageData;
}
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((x) => x.unmount()); }); mockPush.mockClear(); mockPlayFull.mockClear(); mockScrollToTop.mockClear(); });
function render(p: DiscoverPageData, moments: MomentsList = list()): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(DiscoverPage, { page: p, moments })); });
  mounted.push(r);
  return r;
}
const one = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const is = (n: ReactTestInstance | null): boolean => n !== null && n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function';
  const found = r.root.findAll((n) => is(n) && !is(n.parent));
  if (found.length !== 1) throw new Error(`${found.length} buttons named "${label}"`);
  return found[0]!;
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => [x.props['children']].flat(5).join(''));

it('the page is held back (a loading mark) until the first answer; then it appears whole', () => {
  const r = render(page({ shown: false }));
  expect(words(r)).not.toContain('Discover');
  act(() => { r.update(createElement(DiscoverPage, { page: page({ shown: true }), moments: list() })); });
  expect(words(r)).toContain('Discover');
});

// Spec 039 D4 (was: "the bottom zone: the title, the date, the search field with the trending hint, Scan"): the title row of the Page holds Search and Scan as
// 44 icon buttons; the date and the trending hint are gone.
it('the title row: the title, Search and Scan', () => {
  const p = page();
  const r = render(p);
  expect(words(r)).toContain('Discover');
  expect(words(r).some((w) => /^[A-Z]{3} \d{1,2} [A-Z]{3}$/.test(w))).toBe(false);
  expect(one(r, 'Search')).toBeTruthy();
  expect(one(r, 'Scan a QR code')).toBeTruthy();
});

// Was: "the search field and Scan work" (the field reported where it sat: `openSearch(640, undefined)`); the icon passes the top of the page.
it('Search and Scan work', () => {
  const p = page({ hints: [] });
  const r = render(p);
  act(() => { one(r, 'Search').props['onPress'](); });
  expect(p.openSearch).toHaveBeenCalledWith(47, undefined);
  act(() => { one(r, 'Scan a QR code').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith('/scan');
});

// Was: "the pick tile and its actions reach the page's handlers" (the tile at the top): the same three actions are on the Picks section.
it('the picks section and its actions reach the page\'s handlers', () => {
  const p = page({ model: { ...page().model, order: ['picks'] } as never });
  const r = render(p);
  act(() => { one(r, 'Play Pick title').props['onPress'](); });
  expect(p.act.onPlay).toHaveBeenCalledWith(PICK.episode);
  act(() => { one(r, 'Add Pick title to the queue').props['onPress'](); });
  expect(p.queue).toHaveBeenCalledWith(PICK.episode);
  act(() => { one(r, 'Past picks').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/picks/past', params: { before: '2026-10-27' } });
});

// Spec 039 D4 (was: "Hot now comes from the Moments list and plays from there": the HOTTEST moment, a tile beside the shortcuts): the hero is the FIRST moment of the list.
it('the hero comes from the Moments list (its first moment) and plays from there', () => {
  const first = { ...HOT, episodeId: 'f1', episodeTitle: 'First ep', startMs: 43_000, reactions: 3 };
  const r = render(page(), list([first, HOT]));
  act(() => { one(r, 'Play from 0:43').props['onPress'](); });
  expect(mockPlayFull).toHaveBeenCalledWith(first);
  expect(words(r)).not.toContain('Hot ep');
});

it('a shortcut tile goes where the shortcut always went', () => {
  const r = render(page());
  act(() => { one(r, 'Queue').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith('/queue');
  act(() => { one(r, 'Talked about').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith('/chart');
});

it('a stale copy says so, with Retry', () => {
  const r = render(page({ view: { body: { date: '2026-10-27' }, stale: true, fetchedAt: Date.UTC(2026, 9, 27, 9, 12) } as never }));
  expect(words(r).some((w) => w.startsWith("Couldn't refresh — showing what was fetched"))).toBe(true);
});

// Spec 039 D4 (was: the dashed tile with "Pull down to try again."): an `InlineNotice` with a Retry button, which reads Discover again.
it('offline with nothing cached: the notice says so once, and Retry reads again', () => {
  const p = page({ view: undefined, model: { ...page().model, picks: [] } as never });
  const r = render(p);
  expect(words(r).filter((w) => w === "Couldn't reach the server, and nothing is cached yet.")).toHaveLength(1);
  act(() => { one(r, 'Retry').props['onPress'](); });
  expect(p.refreshBoth).toHaveBeenCalled();
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Past picks')).toHaveLength(0);
});

it('there is no collapsing small bar any more', () => {
  const r = render(page());
  // One search control — the icon (it was two: the big box and the collapsed bar's button).
  expect(one(r, 'Search')).toBeTruthy();
  expect(words(r).filter((w) => w === 'Discover')).toHaveLength(1);
});

// Spec 039 D4 (was M31 F2a: "the glow scrolls away and nothing shows under the clock"; the `discover-glow-shift` wrapper and the `clock-scrim` strip): the Page is one
// plain scroll on the void, with no glow and no strip over the status bar.
it('the page draws no glow wrapper and no clock strip', () => {
  const r = render(page());
  expect(r.root.findAll((n) => n.props['testID'] === 'discover-glow-shift' || n.props['testID'] === 'clock-scrim' || n.props['testID'] === 'discover-glow')).toHaveLength(0);
  expect(r.root.findAll((n) => n.props['testID'] === 'page-scroll').length).toBeGreaterThan(0);
});

// 035 T054 (device check L7): the big "Discover" title floats over the For You cards and let touches through (`pointerEvents="none"`), so a tap on
// the title opened the card underneath (Maestro did exactly that, run 41274515878 r05). The title's wrapper takes the touch and does nothing.
// Break: put `pointerEvents="none"` back on the title's wrapper in DiscoverPage.tsx.
it('035 L7: a tap on the Discover title is not passed to the cards under it', () => {
  const r = render(page());
  const header = r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && n.props['children'] === 'Discover')[0];
  expect(header).toBeDefined();
  let n: typeof header | null = header!;
  let found: unknown;
  while (n) { if (n.props['pointerEvents'] !== undefined) { found = n.props['pointerEvents']; break; } n = n.parent; }
  expect(found).not.toBe('none');
});

// 036 T010 (035's A4): "Discover" named four things on one screen (tab, page title, switch segment, empty-state button). The page title is a heading with its own
// spoken name ("Discover, today's picks"). Spec 039: `Page` carries it as `titleLabel`; the strict assertion of before is restored (it had been reduced).
// Break: remove `titleLabel` from the Page in DiscoverPage.tsx.
it('036 A4: the page title is a heading named differently from the tab', () => {
  const r = render(page());
  const header = r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && n.props['children'] === 'Discover')[0];
  expect(header).toBeDefined();
  const name = header!.props['aria-label'] ?? header!.props['accessibilityLabel'];
  expect(name).toBeDefined();
  expect(name).not.toBe('Discover');
  expect(String(name)).toMatch(/^Discover/);
});

// 039 integration: what the rewrite dropped and this brings back.
it('the Discover tab pressed again scrolls the page to the top', () => {
  const p = page();
  render(p);
  expect(mockScrollToTop).toHaveBeenCalled();
  const target = mockScrollToTop.mock.calls[0]![0] as { current: unknown };
  // the hook is given the page's own ScrollView: the one the page's scroller handle points to
  expect(target.current).toBeTruthy();
  expect(target.current).toBe(p.scroller.current);
});

it('the Premium tile scrolls the page to Premium picks', () => {
  const p = page({ model: { ...page().model, order: ['premium'] } as never });
  const r = render(p);
  const scrollTo = jest.fn();
  (p.scroller.current as unknown as { scrollTo: unknown }).scrollTo = scrollTo;
  // the section reports where it sits in the scroll content (the test renderer lays nothing out)
  const marked = r.root.findAll((n) => n.props['testID'] === 'discover-premium' && typeof n.props['onLayout'] === 'function')[0]!;
  act(() => { marked.props['onLayout']({ nativeEvent: { layout: { x: 0, y: 1200, width: 390, height: 200 } } }); });
  act(() => { one(r, 'Premium').props['onPress'](); });
  expect(scrollTo).toHaveBeenCalledWith({ y: 1200 - 56, animated: true });
  expect(mockPush).not.toHaveBeenCalled();
});

