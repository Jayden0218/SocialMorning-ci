// Tests the Search page as one thing: idle, typing, a result page, its tabs, Clear and Cancel.
/**
 * M31 T030 (review D7: SearchPage.tsx was 555 lines and is now the state and the glue over `SearchZone`,
 * `SearchHome`, `SearchResults` …). The pieces have their own tests (m31-t030-search.test.tsx); this one checks
 * that the page joins them: nothing typed shows Recent / Try / Genres and the Scan mark; typing shows the term as
 * the first suggestion; the keyboard's Search (or a tapped suggestion) shows the result page with the five tabs
 * and the catalogue's shows; a tab changes what is shown; ✕ goes back to the idle page; Cancel closes.
 * The break that turns it red: pass `onSubmit` a no-op in the zone (the result page never opens), or leave the
 * catalogue's shows out of `SearchResults`.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SearchPage } from '@/ui/search/SearchPage';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }), useIsFocused: () => true, router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 50, bottom: 34, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({ runOnJS: (f: unknown) => f }));
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: (p: { children: unknown }) => p.children, usePanGesture: () => ({}) }));
const mockSettings = new Map<string, string>();
const mockStores = { settings: { get: (k: string) => mockSettings.get(k), set: (k: string, v: string) => { mockSettings.set(k, v); }, delete: (k: string) => { mockSettings.delete(k); } }, subscriptions: { has: () => false, add: jest.fn(), remove: jest.fn() }, feedCache: {} };
const mockSync = { push: jest.fn() };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useSubscriptionSync: () => mockSync, useToast: () => () => undefined }));
const SHOWS = [{ feedUrl: 'https://f/a.xml', title: 'The Journey Home', author: 'Ana', genres: [] }, { feedUrl: 'https://f/b.xml', title: 'Journey to Sleep', author: 'Calm', genres: [] }];
const mockSearch = jest.fn(async () => ({ shows: SHOWS, episodes: [{ id: 'e1', feedUrl: 'https://f/a.xml', guid: 'e1', title: 'The journey back', showTitle: 'The Journey Home', enclosureUrl: 'https://a/1.mp3' }], episodeSearch: 'ok' }));
const mockSocial = { api: { search: (...a: unknown[]) => (mockSearch as (...x: unknown[]) => unknown)(...a), searchPeople: async () => [] }, listener: undefined };
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => ({ open: jest.fn(), view: undefined }), useCardActions: () => ({ play: jest.fn() }) }));
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({ playFull: jest.fn() }) }));
const mockMoments = { status: 'ready', items: [], more: false, loadingMore: false, failed: false, refresh: async () => undefined, loadMore: async () => undefined, refreshIfOld: () => undefined };
jest.mock('@/ui/discover/useMoments', () => ({ useMoments: () => mockMoments }));
jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: undefined, durationMs: undefined, comments: undefined, mine: undefined }) }));
const mockExplore = { search: jest.fn() };
jest.mock('@/discover/explore-api', () => ({ useExploreApi: () => mockExplore }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ hiddenFeeds: new Set<string>(), listeners: (l: unknown[]) => l }) }));
jest.mock('@/discover/local-search', () => ({ looksLikeFeedUrl: (t: string) => /^https?:\/\/\S+\.\S+/i.test(t.trim()), searchLibrary: () => ({ shows: [], episodes: [] }) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: (p: { list: unknown }) => p.list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/ui/episode/CardSheet', () => ({ CardSheetHost: () => null, openCardSheet: jest.fn() }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => ({ tellEditors: async () => undefined }) }));

const mounted: ReactTestRenderer[] = [];
beforeEach(() => { jest.useFakeTimers(); mockSettings.clear(); mockSearch.mockClear(); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); jest.useRealTimers(); mockPush.mockClear(); });
const all = (r: ReactTestRenderer, label: string): ReactTestInstance[] => r.root.findAll((n) => n.props['accessibilityLabel'] === label && (typeof n.props['onPress'] === 'function' || typeof n.props['onChangeText'] === 'function'));
const has = (r: ReactTestRenderer, label: string): boolean => all(r, label).length > 0;
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const field = (r: ReactTestRenderer): ReactTestInstance => all(r, 'Search podcasts')[0]!;
async function settle(): Promise<void> { await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); await Promise.resolve(); }); }
function page(props: Partial<Parameters<typeof SearchPage>[0]> = {}): { r: ReactTestRenderer; onClose: jest.Mock } {
  const onClose = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SearchPage, { onClose, ...props })); });
  mounted.push(r);
  return { r, onClose };
}

it('nothing typed: the name, the Scan mark, Genres; no tabs', () => {
  const { r } = page();
  expect(words(r)).toContain('Search');
  expect(has(r, 'Scan a QR code')).toBe(true);
  expect(has(r, 'Browse categories')).toBe(true);
  expect(r.root.findAll((n) => n.props['accessibilityRole'] === 'tab')).toHaveLength(0);
});

it('typing: the term is the first suggestion, ✕ replaces the Scan mark; the keyboard\'s Search opens the result page with the five tabs and the shows', async () => {
  const { r } = page();
  act(() => { field(r).props['onChangeText']('journey'); });
  expect(has(r, 'Search for journey')).toBe(true);
  expect(has(r, 'Clear search')).toBe(true);
  expect(has(r, 'Scan a QR code')).toBe(false);
  expect(r.root.findAll((n) => n.props['accessibilityRole'] === 'tab')).toHaveLength(0);
  act(() => { field(r).props['onSubmitEditing'](); });
  await settle();
  const tabs = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tab').map((t) => t.props['accessibilityLabel']);
  expect(tabs).toEqual(['All', 'Shows', 'Episodes', 'Moments', 'People']);
  expect(mockSearch).toHaveBeenCalledWith('journey');
  // All: a deck of Shows with the catalogue's shows.
  expect(words(r).join('|')).toContain('The Journey Home');
  expect(has(r, 'The Journey Home, Ana')).toBe(true);
});

it('a tab changes what is shown: Shows is the mosaic with Subscribe, which toggles the subscription', async () => {
  const { r } = page({ q: 'journey' });
  await settle();
  act(() => { all(r, 'Shows').filter((n) => n.props['accessibilityRole'] === 'tab')[0]!.props['onPress'](); });
  expect(words(r)).toContain('BEST MATCH');
  act(() => { all(r, 'Subscribe to The Journey Home')[0]!.props['onPress'](); });
  expect(mockStores.subscriptions.add).toHaveBeenCalledWith('https://f/a.xml', expect.any(Number));
  expect(mockSync.push).toHaveBeenCalled();
});

it('a tapped show opens its page', async () => {
  const { r } = page({ q: 'journey' });
  await settle();
  act(() => { all(r, 'The Journey Home, Ana')[0]!.props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent('https://f/a.xml') } });
});

it('✕ goes back to the idle page; Cancel closes', async () => {
  const { r, onClose } = page({ q: 'journey' });
  await settle();
  act(() => { all(r, 'Clear search')[0]!.props['onPress'](); });
  expect(r.root.findAll((n) => n.props['accessibilityRole'] === 'tab')).toHaveLength(0);
  expect(has(r, 'Scan a QR code')).toBe(true);
  act(() => { all(r, 'Cancel')[0]!.props['onPress'](); });
  expect(onClose).toHaveBeenCalled();
});

it('a pasted feed address offers "Open feed …" and opens it', () => {
  const { r } = page();
  act(() => { field(r).props['onChangeText']('https://example.com/feed.xml'); });
  act(() => { all(r, 'Open feed https://example.com/feed.xml')[0]!.props['onPress'](); });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent('https://example.com/feed.xml') } });
});
