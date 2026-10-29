// Guard G-M32-C9: the show page reads every episode's notes for search only once search is opened.
/**
 * M32 T033 (review C9): `htmlToText` ran over every episode's shownotes on load, even when search
 * was never opened (feeds of 1 000+ episodes). Break to watch red: compute `searchText` outside
 * the `searching ? … : …` in app/show/[feedUrl].tsx.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const MARK = 'SHOWNOTES-MARK';
const mockEpisodes = Array.from({ length: 30 }, (_, i) => ({
  id: `e${i}`, feedUrl: 'https://f/x', title: `Episode ${i}`, audioUrl: 'https://a/x.mp3', publishedAt: 1_700_000_000_000 - i * 1000,
  durationMs: 60_000, shownotesHtml: `<p>${MARK} ${i}</p>`,
}));
const mockShow = { feedUrl: 'https://f/x', title: 'Show', author: 'A', description: 'desc', imageUrl: '', categories: [] };
const mockStores = {
  settings: { get: () => undefined, set: () => undefined, delete: () => undefined },
  feeds: { getShow: () => mockShow, listEpisodes: () => mockEpisodes },
  subscriptions: { has: () => false, add: () => undefined, remove: () => undefined },
  positions: { get: () => undefined },
  queue: { list: () => [], replace: () => undefined },
  inboxState: { mark: () => undefined },
};
// One object each for the whole run (a new one per render re-runs the page's effects for ever).
const mockSync = { push: jest.fn() };
const mockToast = jest.fn();
const mockSafety = { safety: { isHidden: () => false }, version: 0, hiddenFeeds: new Set<string>() };
const mockSocial = { api: { category: () => Promise.resolve({ shows: [] }), recordShare: () => Promise.resolve() } };
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: {} }) };
const mockPlayerObj = { getState: () => ({ kind: 'idle' }), play: jest.fn(), pause: jest.fn(), load: jest.fn() };
const mockExtras = [undefined, jest.fn()];
const mockShare = [jest.fn(), null];
const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockHtmlToText = jest.fn();
jest.mock('@/ui/kit/format', () => {
  const actual = jest.requireActual('@/ui/kit/format') as { htmlToText: (h: string) => string };
  return { ...actual, htmlToText: (h: string) => { mockHtmlToText(h); return actual.htmlToText(h); } };
});
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
// M31 W3-A2: the Hot moments read and the Moments feed's Play are the screen's own two new inputs; this guard is about the notes.
jest.mock('@/ui/show/useShowMoments', () => ({ useShowMoments: () => ({ status: 'ready', cards: [], all: [], reload: () => undefined }) }));
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({ playFull: () => undefined }) }));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => mockStores,
  useSubscriptionSync: () => mockSync,
  useToast: () => mockToast,
}));
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/playback/store', () => ({
  usePlayer: () => mockPlayerObj,
  usePlayerSelector: () => '',
}));
jest.mock('@/ui/show/ShowExtras', () => ({ useShowExtras: () => mockExtras, ShowExtrasBlock: () => null }));
jest.mock('@/ui/show/ShowSales', () => ({ ShowSales: () => null }));
jest.mock('@/ui/clips/ShareChooser', () => ({ useSharePanel: () => mockShare }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: () => null }));

import ShowScreen from '../app/show/[feedUrl]';

const notesCalls = () => mockHtmlToText.mock.calls.filter((c) => String(c[0]).includes(MARK)).length;

async function mount(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, createElement(ShowScreen))); });
  return r;
}

it('never opening search reads none of the episodes\' notes for it', async () => {
  mockHtmlToText.mockClear();
  const r = await mount();
  // the rows' own summaries use noteSummary, not htmlToText; nothing else reads the notes
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === "Search this show's episodes").length).toBeGreaterThan(0);
  expect(notesCalls()).toBe(0);
});

it('opening search reads the notes, once per episode', async () => {
  mockHtmlToText.mockClear();
  const r = await mount();
  const btn = r.root.findAll((n) => n.props['accessibilityLabel'] === "Search this show's episodes" && typeof n.props['onPress'] === 'function')[0]!;
  await act(async () => { (btn.props['onPress'] as () => void)(); });
  expect(notesCalls()).toBe(mockEpisodes.length);
});
