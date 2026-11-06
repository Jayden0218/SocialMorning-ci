// Searching inside a show replaces the page's episode list with a RESULTS list of the matches.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-5b/README.md defect 5). Written BEFORE the fix: red today.
 * Drawing: design-pulse2 listen.html `show--search`: with "morn" typed the page is `edge('Results')` over a mosaic of the matching episodes as 2 x 1 tiles ("Results are the
 * same 2x1 episode tiles, matches marked in hot 30%; 'No episodes yet.' when nothing matches"); there is no big lead card and no chip row — the page has become the results.
 * The build keeps the episode list and only highlights the match. The tests ask for the swap, not for the highlight.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockEpisodes = Array.from({ length: 4 }, (_, i) => ({
  id: `e${i}`, feedUrl: 'https://f/x', title: `Episode ${i}`, audioUrl: 'https://a/x.mp3', publishedAt: 1_700_000_000_000 - i * 86_400_000,
  durationMs: 1_000_000, shownotesHtml: `<p>notes ${i}</p>`,
}));
const mockShow = { feedUrl: 'https://f/x', title: 'Morning Notes', author: 'Mia Tan', description: 'Short, warm, good with coffee.', imageUrl: '', categories: [] };
let mockSubscribed = false;
const mockListeners = new Set<() => void>();
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
const mockSync = { push: jest.fn(), onChange: (l: () => void) => { mockListeners.add(l); return () => { mockListeners.delete(l); }; } };
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

// 039 (run 42210809479, r22): a show page opened after the sign-in sync, and one open while it lands, both say "Unsubscribe from this show".
async function mount(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, createElement(ShowScreen))); });
  return r;
}
const labelled = (r: ReactTestRenderer, label: string): boolean => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function').length > 0;

it('a table filled before the page opened reads as subscribed', async () => {
  mockSubscribed = true;
  const r = await mount();
  expect(labelled(r, 'Unsubscribe from this show')).toBe(true);
});
it('the sync landing while the page is open flips Subscribe to Unsubscribe', async () => {
  mockSubscribed = false;
  const r = await mount();
  expect(labelled(r, 'Subscribe to this show')).toBe(true);
  await act(async () => { mockSubscribed = true; mockListeners.forEach((l) => l()); });
  expect(labelled(r, 'Unsubscribe from this show')).toBe(true);
});
