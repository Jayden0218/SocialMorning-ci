// Profile numbers as the drawing writes them (1.2k, 8.4k), the listening-time tile that is not cut off, and the host's "Private" subscriptions.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-5b/README.md defect 1). Written BEFORE the fixes. Drawing: design-pulse2 social.html `profileBase()`:
 * `stats` = [['212','Following'],[host?'8.4k':'1.2k','Followers'],[host?'Private':'34','Subscriptions'],['128 h','Listened']] and the Listening time tile
 * `<span ...28px>128 h 14 min</span>` + "312 finished" (notes: "Their private subscriptions show 'Private' with no arrow").
 *  - Followers / Following print through `compactCount` (the shared helper: 1200 -> "1.2k", 8400 -> "8.4k"): RED today (the raw '1200');
 *  - the Listening time tile's total shrinks to fit one line (`adjustsFontSizeToFit`) instead of ellipsizing "128 h 14…": RED today;
 *  - a person who keeps their subscriptions private shows "Private" on the Subscriptions tile (already built: this one is expected to PASS).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
const mockToast = jest.fn();
let mockParams: Record<string, string> = { id: 'rui' };
type Listener = { listenerId: string; displayName: string } | undefined;
let mockListener: Listener = { listenerId: 'me', displayName: 'Mei Lin' };
let mockBlocked = false;
let mockProfileOverride: Record<string, unknown> = {};
let mockLikes: unknown[] = [];
let mockPlaylists: unknown[] = [];
let mockTimeline: unknown[] = [];
const mockSafetyApi = { isBlocked: () => mockBlocked, isHidden: () => false, block: jest.fn(() => 'ok'), unblock: jest.fn() };
const mockStores = {
  positions: { all: () => [] },
  feeds: { getShow: () => undefined, getEpisode: () => undefined },
  subscriptions: { list: () => [{ feedUrl: 'a' }, { feedUrl: 'b' }], has: () => false, add: jest.fn(), remove: jest.fn() },
  settings: { get: () => undefined, set: () => undefined, delete: () => undefined },
  feedCache: {},
};
const baseProfile = () => ({
  id: 'rui', displayName: 'Rui Costa', avatarUrl: null, following: 212, followers: 1200, suspended: false, isFollowing: false,
  bio: 'Mornings, cities, long walks.', country: 'PT', plus: false, likesCount: 3,
  stats: { all: { listenedMs: (128 * 60 + 14) * 60_000, finished: 312, topShows: [] }, last7: { listenedMs: 4 * 3_600_000, finished: 0, topShows: [] } },
  recent: [{ id: 'r1', kind: 'commented', createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), momentMs: 2535000, actor: { id: 'rui', displayName: 'Rui Costa' }, episode: { id: 'e1', title: 'Why mornings matter', showTitle: 'Morning Notes', feedUrl: 'https://f/a.xml' } }],
  ...mockProfileOverride,
});
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/profile',
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/design/tailwind', () => ({ ...jest.requireActual('@/design/tailwind'), Link: ({ children }: { children: unknown }) => children }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast, useSubscriptionSync: () => ({ push: jest.fn() }) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
// The hooks hand back the same objects every render (a fresh one would re-run the page's effects for ever).
const mockSocialApi = { profile: () => Promise.resolve(baseProfile()), follow: jest.fn(), unfollow: jest.fn(), category: jest.fn(() => Promise.resolve({ shows: [], hasMore: false })) };
const mockSocial = { api: mockSocialApi, get listener() { return mockListener; } };
const mockSafetyCtx = { safety: mockSafetyApi, version: 0, feed: (x: unknown[]) => x, hiddenFeeds: new Set<string>() };
const mockProfileApi = { listenerLikes: () => Promise.resolve({ items: mockLikes }), likesTimeline: () => Promise.resolve({ items: mockTimeline }) };
const mockM19 = { listenerPlaylists: () => Promise.resolve(mockPlaylists) };
const mockUs8 = { listenerSubscriptions: () => Promise.resolve({ private: false, items: [1, 2, 3] }) };
const mockExtras = { mutes: () => Promise.resolve([]), mute: jest.fn(), unmute: jest.fn() };
const mockM22 = { oftenListened: () => Promise.resolve({ shows: [{ feedUrl: 'https://f/a.xml', title: 'Morning Notes', imageUrl: null }], hidden: false }) };
const mockCards = { open: jest.fn(), play: jest.fn() };
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/safety/context', () => ({ announce: jest.fn(), useSafety: () => mockSafetyCtx }));
jest.mock('@/social/profile-api', () => ({
  ...jest.requireActual('@/social/profile-api'),
  useProfileApi: () => mockProfileApi,
}));
jest.mock('@/social/m19-api', () => ({ useM19Api: () => mockM19 }));
jest.mock('@/social/us8-api', () => ({ useUs8Api: () => mockUs8 }));
jest.mock('@/social/comment-extras-api', () => ({ useCommentExtrasApi: () => mockExtras }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => mockM22 }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => mockCards }));
jest.mock('@/me/history', () => ({ listeningHistory: () => [{ episode: { id: 'e9', title: 'Rent, explained twice', feedUrl: 'https://f/a.xml', imageUrl: null }, finished: true }], localTotals: () => ({ listenedMs: 0, finished: 0 }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
jest.mock('react-native-reanimated', () => ({ runOnJS: (f: unknown) => f }));
jest.mock('react-native-gesture-handler', () => ({ GestureDetector: (p: { children?: unknown }) => p.children, usePanGesture: () => ({}) }));
jest.mock('@/discover/category-cache', () => ({
  cachedCategory: () => mockCategory(),
  fetchCategory: () => Promise.resolve(mockCategory()),
  firstCovers: () => [],
}));
const mockCategory = () => ({
  shows: [
    { feedUrl: 'https://f/lead', title: 'Money, Plainly', author: 'J. Park', imageUrl: '', genres: ['Business', 'Investing'], latestEpisode: { title: 'Rent, explained twice', publishedAt: new Date().toISOString() } },
    { feedUrl: 'https://f/two', title: 'Cities that Sleep', author: 'N. Shift', imageUrl: '', genres: ['Society'], latestEpisode: undefined },
    { feedUrl: 'https://f/three', title: 'The Long Table', author: 'A. Cook', imageUrl: '', genres: ['Food'], latestEpisode: undefined },
  ],
  hasMore: false, stale: false,
});

import ProfileScreen from '../app/profile/[id]';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  mockPush.mockReset(); mockToast.mockReset();
  mockParams = { id: 'rui' };
  mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
  mockBlocked = false; mockProfileOverride = {}; mockLikes = []; mockPlaylists = []; mockTimeline = [];
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => hosts(r, (n) => n.props['testID'] === id);
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const named = (r: ReactTestRenderer, label: string): ReactTestInstance[] => r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.type === 'string');
const comp = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  return n;
};
/** The host (native) node of a control, where the style and class names end up. */
const host = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => typeof x.type === 'string' && x.props['accessibilityLabel'] === label)[0];
  if (!n) throw new Error(`no host control "${label}"`);
  return n;
};
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = comp(r, label);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
const classOf = (n: ReactTestInstance | undefined): string => String(n?.props['className'] ?? '');


describe('F9-8 Profile numbers (profile--screen, profile--host)', () => {
  it('Followers 8400 prints "8.4k", 1200 prints "1.2k"; Following 212 stays "212"', async () => {
    mockProfileOverride = { followers: 8400 };
    let r = await render(createElement(ProfileScreen));
    expect(words(r)).toContain('8.4k');
    expect(words(r)).not.toContain('8400');
    expect(words(r)).toContain('212');
    mockProfileOverride = { followers: 1200 };
    r = await render(createElement(ProfileScreen));
    expect(words(r)).toContain('1.2k');
    expect(words(r)).not.toContain('1200');
  });

  it('the Listening time total (128 h 14 min) shrinks to fit its line instead of ending in an ellipsis', async () => {
    const r = await render(createElement(ProfileScreen));
    const total = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === '128 h 14 min')[0];
    expect(total).toBeDefined();
    expect(total!.props['numberOfLines']).toBe(2); // wave 5b: web does not shrink text, so it may wrap rather than end in an ellipsis
    expect(total!.props['adjustsFontSizeToFit']).toBe(true);
    expect(total!.props['minimumFontScale']).toBe(0.7);
  });

  it('someone who keeps their subscriptions private shows "Private" on the Subscriptions tile', async () => {
    mockProfileOverride = { privateSubscriptions: true, followers: 8400 };
    const r = await render(createElement(ProfileScreen));
    expect(words(r)).toContain('Private');
    expect(words(r)).toContain('Subscriptions');
  });
});
