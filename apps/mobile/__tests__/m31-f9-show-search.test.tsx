// Searching inside a show replaces the page's episode list with a RESULTS list of the matches.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-5b/README.md defect 5). Written BEFORE the fix: red today.
 * Drawing: design-pulse2 listen.html `show--search`: with "morn" typed the page is `edge('Results')` over a mosaic of the matching episodes as 2 x 1 tiles ("Results are the
 * same 2x1 episode tiles, matches marked in hot 30%; 'No episodes yet.' when nothing matches"); there is no big lead card and no chip row — the page has become the results.
 * The build keeps the episode list and only highlights the match. The tests ask for the swap, not for the highlight.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockEpisodes = Array.from({ length: 4 }, (_, i) => ({
  id: `e${i}`, feedUrl: 'https://f/x', title: `Episode ${i}`, audioUrl: 'https://a/x.mp3', publishedAt: 1_700_000_000_000 - i * 86_400_000,
  durationMs: 1_000_000, shownotesHtml: `<p>notes ${i}</p>`,
}));
const mockShow = { feedUrl: 'https://f/x', title: 'Morning Notes', author: 'Mia Tan', description: 'Short, warm, good with coffee.', imageUrl: '', categories: [] };
let mockSubscribed = false;
const mockSettingsGet = jest.fn(() => undefined);
const mockStores = {
  settings: { get: mockSettingsGet, set: () => undefined, delete: () => undefined },
  feeds: { getShow: () => mockShow, listEpisodes: () => mockEpisodes, getEpisode: (id: string) => mockEpisodes.find((e) => e.id === id) },
  subscriptions: { has: () => mockSubscribed, add: jest.fn(() => { mockSubscribed = true; }), remove: jest.fn(() => { mockSubscribed = false; }) },
  positions: { get: (id: string) => (id === 'e1' ? { offsetMs: 250_000, finished: false } : undefined) },
  queue: { list: () => [] as string[], replace: jest.fn() },
  inboxState: { mark: jest.fn() },
  downloads: { get: () => undefined },
};
const mockSync = { push: jest.fn() };
const mockToast = jest.fn();
const mockSafety = { safety: { isHidden: () => false }, version: 0, hiddenFeeds: new Set<string>() };
const mockSocial = { api: { category: () => Promise.resolve({ shows: [] }), recordShare: () => Promise.resolve() } };
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: { e0: 3 } }) };
const mockPlayerObj = { getState: () => ({ kind: 'idle' }), play: jest.fn(), pause: jest.fn(), load: jest.fn() };
let mockExtras: unknown = { overrides: null, announcements: [], polls: [], hosts: [{ id: 'h1', name: 'Mia Tan', avatarUrl: null }], subscribers: 8100 };
const mockShare = jest.fn();
const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockPlayFull = jest.fn();
let mockMoments: { status: 'loading' | 'ready' | 'error'; cards: unknown[]; all: unknown[]; reload: () => void } = { status: 'ready', cards: [], all: [], reload: () => undefined };
let mockNow = false;
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    useLocalSearchParams: () => ({ feedUrl: encodeURIComponent('https://f/x') }),
    useRouter: () => mockRouter,
    usePathname: () => '/show/x',
    useFocusEffect: (f: () => void | (() => void)) => { useEffect(() => f(), [f]); },
  };
});
jest.mock('@/feeds/fetch', () => ({ refreshShow: () => new Promise(() => undefined) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useSubscriptionSync: () => mockSync, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: mockNow, player: false }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayerObj, usePlayerSelector: () => '' }));
jest.mock('@/ui/show/ShowExtras', () => ({ useShowExtras: () => [mockExtras, jest.fn()], ShowExtrasBlock: () => null }));
jest.mock('@/ui/show/ShowSales', () => ({ ShowSales: () => null }));
jest.mock('@/ui/clips/ShareChooser', () => ({ useSharePanel: () => [mockShare, null] }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: (p: { episode?: { id: string } }) => (p.episode ? require('react').createElement('EpisodeRowSheetOpen', { id: p.episode.id }) : null) }));
jest.mock('@/ui/show/useShowMoments', () => ({ useShowMoments: () => mockMoments }));
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({ playFull: mockPlayFull }) }));

import ShowScreen from '../app/show/[feedUrl]';
import { SHOW } from '../src/ui/show/measures';

const host = (n: ReactTestInstance): boolean => typeof n.type === 'string';
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.find((n) => host(n) && n.props['testID'] === id);
const allById = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => host(n) && n.props['testID'] === id);
const pressable = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;
const press = (r: ReactTestRenderer, label: string): void => { act(() => { (pressable(r, label).props['onPress'] as () => void)(); }); };
const texts = (r: ReactTestRenderer): Set<string> => new Set(r.root.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children'] as string));

async function mount(top = 50): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top, bottom: 34, left: 0, right: 0 } }, createElement(ShowScreen))); });
  return r;
}

beforeEach(() => {
  mockSubscribed = false; mockNow = false;
  mockExtras = { overrides: null, announcements: [], polls: [], hosts: [{ id: 'h1', name: 'Mia Tan', avatarUrl: null }], subscribers: 8100 };
  mockMoments = { status: 'ready', cards: [], all: [], reload: () => undefined };
  jest.clearAllMocks();
});


const type = (r: ReactTestRenderer, text: string): void => {
  const field = r.root.findAll((n) => typeof n.props['onChangeText'] === 'function')[0]!;
  act(() => { (field.props['onChangeText'] as (t: string) => void)(text); });
};

describe('F9-11 Show search shows RESULTS', () => {
  it('with a query typed: a RESULTS label, only the matching episode as a 2 x 1 tile, no lead card', async () => {
    const r = await mount();
    press(r, "Search this show's episodes");
    type(r, 'Episode 2');
    expect(texts(r).has('RESULTS')).toBe(true);
    expect(allById(r, 'show-big-tile')).toHaveLength(0);
    const rows = allById(r, 'show-row-tile');
    expect(rows).toHaveLength(1);
    expect(r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && n.props['accessibilityLabel'].startsWith('Episode 2.') && typeof n.props['onPress'] === 'function')).not.toHaveLength(0);
    expect(r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && n.props['accessibilityLabel'].startsWith('Episode 1.') && typeof n.props['onPress'] === 'function')).toHaveLength(0);
  });
  it('closing the search brings the episode list back (no RESULTS label)', async () => {
    const r = await mount();
    press(r, "Search this show's episodes");
    type(r, 'Episode 2');
    press(r, 'Close search');
    expect(texts(r).has('RESULTS')).toBe(false);
    expect(allById(r, 'show-big-tile')).toHaveLength(1);
  });
});
