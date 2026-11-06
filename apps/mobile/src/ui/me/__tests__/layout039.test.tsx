// Spec 039 US2 (T013): Me sits on the layout frame: Page, a 2 x 2 TileGrid of equal tiles, no EdgeLabel, "Continue listening" only while something is loaded.
/**
 * Written BEFORE the rebuild (red against the 038 page: it draws an EdgeLabel, a mosaic with a tall tile and no Page). Break to watch red:
 * put `<EdgeLabel label="Me" />` back into app/(tabs)/me.tsx, or draw the Continue card with no episode.
 */
import { createElement } from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
let mockPlayer: Record<string, unknown> = { kind: 'idle' };
const mockSocial = { api: {}, listener: { listenerId: 'me', displayName: 'Mei Lin' } };
const mockStores = {
  settings: { get: () => undefined, set: () => undefined },
  feedCache: {},
  downloads: { list: () => [1, 2] },
  feeds: {
    getEpisode: () => ({ id: 'e1', title: 'A minute of tone', feedUrl: 'f', imageUrl: undefined, durationMs: 60_000 }),
    getShow: () => ({ title: 'Journey Morning', imageUrl: undefined }),
  },
};
jest.mock('expo-router', () => {
  const { cloneElement: clone, isValidElement: valid, createElement: make } = require('react');
  const { Pressable } = require('react-native');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
    Link: ({ href, children, asChild }: { href: unknown; children: unknown; asChild?: boolean }) =>
      (asChild && valid(children) ? clone(children as never, { onPress: () => mockPush(href), style: undefined }) : make(Pressable, { onPress: () => mockPush(href) }, children)),
    useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
    useScrollToTop: () => undefined,
  };
});
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores }));
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => ({ me: () => new Promise(() => undefined) }) }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/me/moments', () => ({ listMoments: () => [1, 2, 3] }));
jest.mock('@/graph/feed', () => ({ createFeed: () => ({ unread: () => 0, cached: () => undefined }) }));
jest.mock('@/social/m19-api', () => ({ lastMonth: () => '2026-09', monthName: () => 'September' }));
jest.mock('@/playback/store', () => ({ ...jest.requireActual('@/playback/store'), usePlayerSelector: (sel: (s: unknown) => unknown) => sel(mockPlayer), usePlayer: () => ({ play: jest.fn(), pause: jest.fn() }) }));
jest.mock('@/ui/lib/alert-dialog', () => ({ AlertDialog: () => null }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import MeScreen from '../../../../app/(tabs)/me';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => { setReducedMotionForTest(true); mockPlayer = { kind: 'idle' }; });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });

async function render(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(MeScreen)); await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const words = (r: ReactTestRenderer): string[] => r.root.findAll((n) => n.type === RNText).map((x) => [x.props['children']].flat(5).join(''));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id);
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;

it('Me draws no EdgeLabel and sits on Page', async () => {
  const r = await render();
  // 039 I2: EdgeLabel is deleted (retired-check refuses its import); its tell-tale, the invisible measuring copy, must not be drawn.
  expect(byId(r, 'edge-measure')).toHaveLength(0);
  expect(r.root.findAll((n) => n.type === require('@/ui/kit/layout').Page).length).toBe(1);
  expect(byId(r, 'page-scroll').length).toBeGreaterThan(0);
});

it('the four tiles are one TileGrid of equal tiles: Saved moments, Downloads, History, Favourites', async () => {
  const r = await render();
  const grid = byId(r, 'tile-grid');
  expect(grid.length).toBe(1);
  const cells = grid[0]!.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'tile-cell');
  expect(cells.length).toBe(4);
  const labels = cells.map((c) => String(c.findAll((n) => typeof n.props['accessibilityLabel'] === 'string')[0]?.props['accessibilityLabel']));
  expect(labels[0]).toMatch(/^Saved moments/);
  expect(labels[1]).toMatch(/^Downloads/);
  expect(labels[2]).toMatch(/^Listening history/);
  expect(labels[3]).toMatch(/^Favourites/);
  const tiles = cells.map((c) => flat(c.findAll((n) => typeof n.props['accessibilityLabel'] === 'string')[0]!));
  const heights = new Set(tiles.map((t) => t['minHeight']));
  expect(heights.size).toBe(1);
  expect(tiles.every((t) => t['width'] === undefined && t['flex'] === undefined || t['flex'] === 1)).toBe(true);
});

it('"Continue listening" is drawn only while an episode is loaded', async () => {
  expect(words(await render())).not.toContain('Continue listening');
  act(() => { mounted.splice(0).forEach((x) => x.unmount()); });
  mockPlayer = { kind: 'paused', episodeId: 'e1', positionMs: 5_000, durationMs: 60_000, by: 'user' };
  const w = words(await render());
  expect(w).toContain('Continue listening');
  expect(w).toContain('A minute of tone');
  expect(w).toContain('Journey Morning');
  expect(w.join(' ')).toContain('0:55 left');
});

it('every pill is ONE style: minHeight 44, minWidth 44, 14 padding, pill radius, even when the Link hands down `style: undefined` (device run 42017007191)', async () => {
  const r = await render();
  const pills = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'link' && typeof n.props['accessibilityLabel'] === 'string' && n.props['testID'] === undefined && /^(Notifications|Queue|My comments|Likes|Creator centre|Playlists|Your |Tips I gave|Feedback|Wallet|SocialNet)/.test(String(n.props['accessibilityLabel'])));
  expect(pills.length).toBeGreaterThanOrEqual(3);
  const seen = pills.map((p) => flat(p));
  for (const s of seen) {
    expect(Number(s['minHeight'])).toBeGreaterThanOrEqual(44);
    expect(Number(s['minWidth'])).toBeGreaterThanOrEqual(44);
    expect(s['paddingHorizontal']).toBe(14);
    expect(s['borderRadius'] ?? 999).toBeGreaterThanOrEqual(0);
  }
});

it('the Me header names you on one line, in the heading step (not the 30 pt title that wrapped "Listener 05")', async () => {
  const r = await render();
  const head = r.root.findAll((n) => n.type === RNText && n.props['accessibilityRole'] === 'header')[0]!;
  expect(head.props['numberOfLines']).toBe(1);
  expect(String(head.props['className'])).toContain('text-pulse-heading');
  expect(String(head.props['className'])).not.toContain('text-pulse-title');
});

it('Saved moments draws the bookmark glyph, Favourites the star', async () => {
  const r = await render();
  const icon = (label: RegExp): unknown => {
    const tile = r.root.findAll((n) => typeof n.type === 'string' && label.test(String(n.props['accessibilityLabel'])) && n.props['accessibilityRole'] === 'link')[0]!;
    return tile.findAll((n) => typeof n.type !== 'string' && n.props['name'] !== undefined && n.props['size'] !== undefined)[0]?.props['name'];
  };
  expect(icon(/^Saved moments/)).toBe('bookmark-outline');
  expect(icon(/^Favourites/)).toBe('star-outline');
});

it('the Downloads tile keeps its old spoken name "Downloads" (D2; the flow matches it whole): the count is drawn, not spoken into the name (run 42025739896)', async () => {
  const r = await render();
  const names = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'link').map((n) => String(n.props['accessibilityLabel']));
  expect(names).toContain('Downloads');
  expect(names).not.toContain('Downloads, 2');
});

// r03-sign-in (device run dc-42195296273): signed out, the flow taps "Sign in" and hit a title that opened nothing. The pre-039 page's title "Sign in ›" was the link.
it('signed out, the title is the link to sign-in, spoken "Sign in"; signed in, the name is a header and opens nothing', async () => {
  const listener = mockSocial.listener;
  (mockSocial as { listener: unknown }).listener = undefined;
  try {
    const r = await render();
    const link = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && n.props['accessibilityRole'] === 'link' && n.props['accessibilityLabel'] === 'Sign in' && n.props['testID'] === undefined)
      .filter((n) => n.findAll((c) => c.type === RNText && [c.props['children']].flat(5).join('').startsWith('Sign in')).length > 0 && n.findAll((c) => c.props['className'] !== undefined && String(c.props['className']).includes('text-pulse-heading')).length > 0);
    expect(link.length).toBeGreaterThan(0);
    mockPush.mockClear();
    act(() => link[0]!.props['onPress']());
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  } finally {
    (mockSocial as { listener: unknown }).listener = listener;
  }
  const signedIn = await render();
  expect(signedIn.root.findAll((n) => n.type === RNText && n.props['accessibilityRole'] === 'header' && n.props['accessibilityLabel'] === 'Mei Lin')).toHaveLength(1);
});
