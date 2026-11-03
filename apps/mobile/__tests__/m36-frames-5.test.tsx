// Tests that the Show page's host, Show all and tabs are 44 pt frames.
/**
 * 036 lane F (device run 41541862006, `reduce_motion=false`). The frame guard read these off the hierarchies: the player/transcript page's "Show: Journey Morning" 114 x 18,
 * the Show page's "Host: Journey Host" 26 x 26, "Description. Show all" 52 x 18, the tabs "Episodes" 65 x 20 and "About" 44 x 20.
 * Jest has no layout engine, so this reads the style the engine is given: `minHeight` / `minWidth` 44 on the pressable that carries the name and the negative margin that
 * keeps the layout as drawn (never `hitSlop` alone). The two tabs sit in a 48 pill, so they need the frame only (no margin).
 *
 * NOT here: the player/transcript page's "Show: Journey Morning" 114 x 18 (`PlayerTitleBlock`; `m31-l8-drawing.test.tsx` "the show link is the drawn 18 line with a 48 tap area" pins `minHeight` undefined on it) and the comment composer's "Cancel" 62 x 26 (CommentsScreen composer head). `m31-comments.test.tsx` ("the head's Cancel is text in a 38 row") pins `minHeight` undefined on it, so the frame
 * waits for the owner to move that pin (reported, tasks.md "Open questions").
 *
 * The break that turns it red: take `minHeight` off one of them (each was red before the fix, 2026-11-03).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bars } from '@/design';

const mockEpisodes = [{ id: 'e0', feedUrl: 'https://f/x', title: 'Episode 0', audioUrl: 'https://a/x.mp3', publishedAt: 1_700_000_000_000, durationMs: 1_000_000, shownotesHtml: '<p>n</p>' }];
const mockShow = { feedUrl: 'https://f/x', title: 'Journey Morning', author: 'Mia Tan', description: 'Short, warm, good with coffee.', imageUrl: '', categories: [] };
const mockSettings = new Map<string, string>();
const mockStores = {
  settings: { get: (k: string) => mockSettings.get(k), set: (k: string, v: string) => { mockSettings.set(k, v); }, delete: () => undefined },
  feeds: { getShow: () => mockShow, listEpisodes: () => mockEpisodes, getEpisode: (id: string) => (id === 'e1' ? { id: 'e1', feedUrl: 'https://f/x', title: 'Ep', durationMs: 600_000 } : mockEpisodes.find((e) => e.id === id)) },
  subscriptions: { has: () => false, add: jest.fn(), remove: jest.fn() },
  positions: { get: () => undefined },
  queue: { list: () => [] as string[], replace: jest.fn() },
  inboxState: { mark: jest.fn() },
  downloads: { get: () => undefined },
};
const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockPlayerObj = { getState: () => ({ kind: 'idle' }), play: jest.fn(), pause: jest.fn(), load: jest.fn(), clip: () => undefined };
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ feedUrl: encodeURIComponent('https://f/x') }),
    useRouter: () => mockRouter,
    usePathname: () => '/show/x',
    useFocusEffect: (f: () => void | (() => void)) => { useEffect(() => f(), [f]); },
  };
});
jest.mock('@/feeds/fetch', () => ({ refreshShow: () => new Promise(() => undefined) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useSubscriptionSync: () => ({ push: jest.fn() }), useToast: () => jest.fn() }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockSafety = { safety: { isHidden: () => false }, version: 0, hiddenFeeds: new Set<string>() };
const mockEpisodeSocial = { cached: undefined, stale: false };
const mockSocial = {
  api: { category: () => Promise.resolve({ shows: [] }), recordShare: () => Promise.resolve() },
  composer: { canSubmit: () => false, submit: jest.fn() },
  bump: jest.fn(),
  useEpisodeSocial: () => mockEpisodeSocial,
};
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: {} }) };
const mockExtras = [{ overrides: null, announcements: [], polls: [], hosts: [{ id: 'h1', name: 'Journey Host', avatarUrl: null }], subscribers: 8100 }, jest.fn()];
jest.mock('@/safety/context', () => ({ useSafety: () => mockSafety }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/social/live', () => ({ liveLabel: () => undefined, useListeningNow: () => undefined }));
jest.mock('@/playback/store', () => ({ ...jest.requireActual('@/playback/store'), usePlayer: () => mockPlayerObj, usePlayerSelector: (sel: (s: unknown) => unknown) => sel({ kind: 'idle' }) }));
jest.mock('@/ui/show/ShowExtras', () => ({ useShowExtras: () => mockExtras, ShowExtrasBlock: () => null }));
jest.mock('@/ui/show/ShowSales', () => ({ ShowSales: () => null }));
jest.mock('@/ui/clips/ShareChooser', () => ({ useSharePanel: () => [jest.fn(), null] }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: () => null }));
jest.mock('@/ui/show/useShowMoments', () => ({ useShowMoments: () => ({ status: 'ready', cards: [], all: [], reload: () => undefined }) }));
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({ playFull: jest.fn() }) }));
jest.mock('expo-blur', () => ({ BlurView: () => null }));

import ShowScreen from '../app/show/[feedUrl]';
import { SHOW } from '@/ui/show/measures';

const MIN = bars.circle;
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
/** The pressable host that carries the name and a style. */
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = r.root.findAll((n) => n.props['accessibilityLabel'] === label && n.props['style'] !== undefined && typeof n.props['onPress'] === 'function');
  if (found.length === 0) throw new Error(`no host named ${label}`);
  return found[0]!;
};
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
async function mount(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, el)); for (let i = 0; i < 4; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}

describe('036 lane F: the Show page', () => {
  it('"Host: <name>" is a 44 x 44 frame round the 26 avatar (22 and its 2 pt ring): -9 on each side, the avatar centred', async () => {
    const r = await mount(createElement(ShowScreen));
    const s = flat(byLabel(r, 'Host: Journey Host'));
    expect([s['minWidth'], s['minHeight']]).toEqual([MIN, MIN]);
    expect([s['marginRight'], s['marginVertical']]).toEqual([-9, -9]);
    expect(s['marginLeft']).toBe(-9); // the first host: no overlap, only the frame's overhang
    expect(MIN - (SHOW.hostAvatar + 4)).toBe(18);
  });
  it('"Description. Show all" is a 44 frame, -13 above and below its 18 line', async () => {
    const r = await mount(createElement(ShowScreen));
    const s = flat(byLabel(r, 'Description. Show all'));
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-13);
  });
  it.each(['Episodes', 'About'])('the "%s" tab is a 44 frame inside the 48 pill', async (name) => {
    const r = await mount(createElement(ShowScreen));
    const s = flat(byLabel(r, name));
    expect([s['minWidth'], s['minHeight']]).toEqual([MIN, MIN]);
  });
});
