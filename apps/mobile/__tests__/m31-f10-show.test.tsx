// The Show page's thumb zone on a 320 wide phone: Subscribe is not wider than its slot, and counts print short.
/**
 * M31 F10 (FR-031; contact/widths/README.md W4, W1). Written BEFORE the fix: red where noted. At 320 the row Subscribe | Share | Episodes . About is
 * 280 wide for 3 parts: the Subscribe pill (flex-1) needs `min-w-0` so it can be narrower than its words, the words shrink to fit (one line), and the
 * Episodes . About pill may shrink too, so nothing is cut at the left edge. A show with 12 345 678 subscribers writes "12.3M subs" (expected to PASS: the
 * header already abbreviates; pinned here).
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
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 320, height: 568, scale: 2, fontScale: 1 })) }));
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


const classes = (n: ReactTestInstance): string => String(n.props['className'] ?? '');

beforeEach(() => {
  mockSubscribed = false; mockNow = false;
  mockExtras = { overrides: null, announcements: [], polls: [], hosts: [{ id: 'h1', name: 'Mia Tan', avatarUrl: null }], subscribers: 12_345_678 };
  mockMoments = { status: 'ready', cards: [], all: [], reload: () => undefined };
  jest.clearAllMocks();
});

describe('F10-W4 the Show thumb zone at 320', () => {
  it('Subscribe can be narrower than its words (min-w-0) and its words shrink to fit on one line', async () => {
    const r = await mount();
    const sub = pressable(r, 'Subscribe to this show');
    const hostNode = [sub, ...sub.findAll((n) => true)].find((n) => /\bmin-w-0\b/.test(classes(n)) || flat(n)['minWidth'] === 0);
    expect(hostNode).toBeDefined();
    const words = sub.findAll((n) => String(n.type) === 'Text')[0]!;
    expect(words.props['numberOfLines']).toBe(1);
    expect(words.props['adjustsFontSizeToFit']).toBe(true);
  });
  it('the Episodes . About pill may shrink (flexShrink) instead of squeezing the share circle', async () => {
    const r = await mount();
    const tab = pressable(r, 'Episodes');
    let ok = false;
    for (let n: ReactTestInstance | null = tab; n && n.props['testID'] !== 'show-thumb-zone'; n = n.parent) {
      if (Number(flat(n)['flexShrink']) > 0 || /\bflex-shrink\b|\bmin-w-0\b/.test(classes(n))) ok = true;
    }
    expect(ok).toBe(true);
  });
  it('12 345 678 subscribers read "12.3M" (expected to pass today)', async () => {
    const r = await mount();
    expect([...texts(r)].join(' | ')).toMatch(/12\.3M/);
  });
});
