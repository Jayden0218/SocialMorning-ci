// Tests that Discover's page joins the decks: the owner's order, the hidden slot, the "Not liking these?" line.
/**
 * M31 T030. The decks have their own tests (m31-t030-decks.test.tsx); this one renders `DiscoverPage` with the
 * sections and checks what only the page decides: the sections come in the owner's order (`model.order`), each
 * under its edge label; a card just hidden keeps its slot in the For You deck (`page.undo.at`) and Undo reaches
 * the page's handler; "Not liking these?" shows only for a signed-in listener with For You rows; the owner's
 * rename of a section is the edge label. The break that turns it red: pass `at: 0` for every hidden card, or draw
 * the line for a signed-out listener.
 */
import { createRef, createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { DiscoverPage } from '@/ui/discover/DiscoverPage';
import type { DiscoverPageData } from '@/ui/discover/useDiscoverPage';
import type { MomentsList } from '@/ui/discover/useMoments';
import { applyConfig } from '@/config/store';
import { CONFIG_DEFAULTS } from '@socialmorning/social-core';

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
jest.mock('expo-router', () => ({ useScrollToTop: () => undefined, useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }), useFocusEffect: () => undefined, router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('react-native-safe-area-context', () => {
  const { createContext } = require('react');
  const insets = { top: 47, bottom: 34, left: 0, right: 0 };
  return { useSafeAreaInsets: () => insets, SafeAreaInsetsContext: createContext(insets) };
});
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined }, feedCache: {}, queue: { list: () => [] } }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: undefined }) }));
jest.mock('@/discover/category-cache', () => ({ warmCategories: () => undefined }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({ playFull: jest.fn() }) }));
jest.mock('@/ui/discover/TheirLikes', () => ({ TheirLikes: () => null }));
jest.mock('@/ui/discover/TreasureHunt', () => ({ TreasureHunt: () => null }));

const card = (id: string) => ({ id, feedUrl: `https://f/${id}.xml`, guid: id, title: `Title ${id}`, showTitle: `Show ${id}`, enclosureUrl: `https://a/${id}.mp3` });
const PICK = { kind: 'pick', key: 'k', episode: card('p') };
const list = (): MomentsList => ({ status: 'ready', items: [], more: false, loadingMore: false, failed: false, refresh: jest.fn(async () => undefined), loadMore: jest.fn(async () => undefined), refreshIfOld: jest.fn() });
function page(over: Record<string, unknown> = {}, model: Record<string, unknown> = {}): DiscoverPageData {
  return {
    router: { push: mockPush }, stores: {}, view: { body: { date: '2026-10-27' }, stale: false, fetchedAt: 0 }, refreshing: false, refreshBoth: jest.fn(), queue: jest.fn(), listener: undefined,
    forYou: {}, outbox: { opened: jest.fn() },
    model: { order: ['picks', 'forYou', 'chart', 'categories'], picks: [PICK], chart: [{ key: 'top', label: 'Top', rows: [card('c1')] }], forYou: ['a', 'b', 'c'].map((k, index) => ({ card: card(k), line: `why ${k}`, index })), pickedShows: [], shows: [], premium: [], video: [], collections: [], said: [], arrivals: [], ...model },
    hints: [], shown: true, act: { onOpen: jest.fn(), onPlay: jest.fn(), stats: {} }, scroller: createRef(), moreFor: undefined, setMoreFor: jest.fn(), undo: undefined, undoHide: jest.fn(),
    notInterested: jest.fn(), hiddenCats: [], hideCat: jest.fn(), showCat: jest.fn(), showPage: jest.fn(), allCategories: jest.fn(), openSearch: jest.fn(), open: jest.fn(),
    ...over,
  } as unknown as DiscoverPageData;
}
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((x) => x.unmount()); }); mockPush.mockClear(); applyConfig(CONFIG_DEFAULTS); });
function render(p: DiscoverPageData): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(DiscoverPage, { page: p, moments: list() })); });
  mounted.push(r);
  return r;
}
/** The section headings (spec 039 D4, was: the edge labels, found by their `accessibilityLabel`): the `Section` titles, in order; the page's own "Discover" title is left out. */
const edgeLabels = (r: ReactTestRenderer): string[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'header').map((n) => [n.props['children']].flat(5).join('')).filter((t) => t !== 'Discover');
const has = (r: ReactTestRenderer, label: string): boolean => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function').length > 0;

it('the sections come in the owner\'s order, each under its Section heading, after Browse (spec 039 D4: was each edge label, after the pick tile)', () => {
  const r = render(page());
  expect(edgeLabels(r)).toEqual(['Browse', "Editor's picks · Oct 27", 'For You', 'Charts', 'Explore by category']);
  const reordered = render(page({}, { order: ['chart', 'picks'] }));
  expect(edgeLabels(reordered)).toEqual(['Browse', 'Charts', "Editor's picks · Oct 27"]);
});

it('a hidden section is not drawn', () => {
  expect(edgeLabels(render(page({}, { order: ['chart'] })))).toEqual(['Browse', 'Charts']);
});

it('the owner\'s rename of a section is its heading (a screen reader hears the new name too)', () => {
  applyConfig({ ...CONFIG_DEFAULTS, sectionTitles: { ...CONFIG_DEFAULTS.sectionTitles, 'For You': 'Made for you' } });
  const r = render(page({}, { order: ['forYou'] }));
  expect(edgeLabels(r)).toEqual(['Browse', 'Made for you']);
});

it('a card just hidden keeps its slot in the deck, and Undo reaches the page', () => {
  const undoHide = jest.fn();
  const rows = ['a', 'c'].map((k, index) => ({ card: card(k), line: `why ${k}`, index }));
  const r = render(page({ undo: { kind: 'episode', key: 'k', at: 1 }, undoHide, listener: { listenerId: 'me' } }, { order: ['forYou'], forYou: rows }));
  const cards = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'deck-card');
  expect(cards).toHaveLength(3);
  expect(String(cards[1]!.props['className'])).toMatch(/border-dashed/);
  expect(cards[0]!.findAll((n) => n.props['accessibilityLabel'] === 'Play Title a').length).toBeGreaterThan(0);
  expect(cards[2]!.findAll((n) => n.props['accessibilityLabel'] === 'Play Title c').length).toBeGreaterThan(0);
  act(() => { r.root.findAll((n) => n.props['accessibilityLabel'] === 'Undo' && typeof n.props['onPress'] === 'function')[0]!.props['onPress'](); });
  expect(undoHide).toHaveBeenCalled();
});

it('"Not liking these?" is under the For You deck for a signed-in listener only; "···" likewise', () => {
  const signedOut = render(page({}, { order: ['forYou'] }));
  expect([has(signedOut, 'Not liking these? Tell us why'), has(signedOut, 'More for Title a')]).toEqual([false, false]);
  const signedIn = render(page({ listener: { listenerId: 'me' } }, { order: ['forYou'] }));
  expect([has(signedIn, 'Not liking these? Tell us why'), has(signedIn, 'More for Title a')]).toEqual([true, true]);
  act(() => { signedIn.root.findAll((n) => n.props['accessibilityLabel'] === 'Not liking these? Tell us why' && typeof n.props['onPress'] === 'function')[0]!.props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith('/onboarding/not-liking');
});

// Spec 039 D4 (was: "the pick tile is followed by 18 of room, then the first deck"): the sections sit on the Page's 20 gutter with 24 between them.
it('the sections sit on the 20 gutter with 24 between them', () => {
  const r = render(page({}, { order: ['chart'] }));
  const scroll = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'page-scroll')[0]!;
  const content = StyleSheet.flatten(scroll.props['contentContainerStyle']) as Record<string, unknown>;
  expect([content['paddingHorizontal'], content['gap']]).toEqual([20, 24]);
});
