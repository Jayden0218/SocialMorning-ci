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
jest.mock('expo-router', () => ({ useScrollToTop: () => undefined, useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }), useFocusEffect: () => undefined }));
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
afterEach(() => { act(() => { mounted.splice(0).forEach((x) => x.unmount()); }); mockPush.mockClear(); mockPlayFull.mockClear(); });
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
/** The test renderer's Views answer `measureInWindow` like laid-out ones (the search field reports where it sits). */
const layOut = (r: ReactTestRenderer): void => {
  for (const n of r.root.findAll((x) => x.instance && typeof (x.instance as { measureInWindow?: unknown }).measureInWindow === 'function')) {
    (n.instance as { measureInWindow: unknown }).measureInWindow = (cb: (x: number, y: number) => void) => cb(0, 640);
  }
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => [x.props['children']].flat(5).join(''));

it('the page is held back (a loading mark) until the first answer; then it appears whole', () => {
  const r = render(page({ shown: false }));
  expect(words(r)).not.toContain('Discover');
  act(() => { r.update(createElement(DiscoverPage, { page: page({ shown: true }), moments: list() })); });
  expect(words(r)).toContain('Discover');
});

it('the bottom zone: the title, the date, the search field with the trending hint, Scan', () => {
  const p = page();
  const r = render(p);
  expect(words(r)).toContain('Discover');
  expect(words(r).some((w) => /^[A-Z]{3} \d{1,2} [A-Z]{3}$/.test(w))).toBe(true);
  // With one hint the field shows it (`hintAt`); the name says so.
  expect(one(r, 'Search. Trending: morning routines')).toBeTruthy();
});

it('the search field and Scan work', () => {
  const p = page({ hints: [] });
  const r = render(p);
  layOut(r);
  act(() => { one(r, 'Search shows and episodes').props['onPress'](); });
  expect(p.openSearch).toHaveBeenCalledWith(640, undefined);
  act(() => { one(r, 'Scan a QR code').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith('/scan');
});

it('the pick tile and its actions reach the page\'s handlers', () => {
  const p = page();
  const r = render(p);
  act(() => { one(r, 'Play Pick title').props['onPress'](); });
  expect(p.act.onPlay).toHaveBeenCalledWith(PICK.episode);
  act(() => { one(r, 'Add Pick title to the queue').props['onPress'](); });
  expect(p.queue).toHaveBeenCalledWith(PICK.episode);
  act(() => { one(r, 'Past picks').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/picks/past', params: { before: '2026-10-27' } });
});

it('Hot now comes from the Moments list and plays from there', () => {
  const r = render(page(), list([{ ...HOT, reactions: 3 }, HOT]));
  act(() => { one(r, 'Hot now: play Hot ep from 14:32. 41 reacting').props['onPress'](); });
  expect(mockPlayFull).toHaveBeenCalledWith(HOT);
});

it('a shortcut tile goes where the shortcut always went', () => {
  const r = render(page());
  act(() => { one(r, 'Queue').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith('/queue');
  act(() => { one(r, 'Talked about').props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith('/chart');
});

it('a stale copy says so above the mosaic', () => {
  const r = render(page({ view: { body: { date: '2026-10-27' }, stale: true, fetchedAt: Date.UTC(2026, 9, 27, 9, 12) } as never }));
  expect(words(r).some((w) => w.startsWith("Couldn't refresh — showing what was fetched"))).toBe(true);
});

it('offline with nothing cached: the dashed tile says so once', () => {
  const r = render(page({ view: undefined, model: { ...page().model, picks: [] } as never }));
  expect(words(r).filter((w) => w === "Couldn't reach the server, and nothing is cached yet.")).toHaveLength(1);
  expect(words(r)).toContain('Pull down to try again.');
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Past picks')).toHaveLength(0);
});

it('there is no collapsing small bar any more', () => {
  const r = render(page());
  // One search control — the pinned field (it was two: the big box and the collapsed bar's button).
  expect(one(r, 'Search. Trending: morning routines')).toBeTruthy();
  expect(words(r).filter((w) => w === 'Discover')).toHaveLength(1);
});

// M31 F2a (design-pulse2 home--fold-a/-b: the drawing clips the page at 58 and has no glow below the first screen).
// Break: move <DiscoverGlow /> out of the `discover-glow-shift` wrapper (it stays pinned), or delete the `clock-scrim` View.
describe('F2a: the glow scrolls away and nothing shows under the clock', () => {
  it('the ambient glow is inside the wrapper that follows the scroll offset', () => {
    const r = render(page());
    const wrapper = r.root.findByProps({ testID: 'discover-glow-shift' });
    expect(wrapper.findAllByProps({ testID: 'discover-glow' }).length).toBeGreaterThan(0);
  });
  it('a void strip, 8 taller than the status bar, sits above the scroll (58 = 50 + 8 drawn)', () => {
    const r = render(page());
    const scrim = r.root.findByProps({ testID: 'clock-scrim' });
    const flat = Object.assign({}, ...[scrim.props['style']].flat(3).filter(Boolean));
    expect(flat.height).toBe(47 + 8);
    expect(flat.top).toBe(0);
    expect(flat.backgroundColor).toBeTruthy();
    expect(scrim.props['pointerEvents']).toBe('none');
  });
});
