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
      (asChild && valid(children) ? clone(children as never, { onPress: () => mockPush(href) }) : make(Pressable, { onPress: () => mockPush(href) }, children)),
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
  expect(r.root.findAll((n) => n.type === require('@/ui/kit/EdgeLabel').EdgeLabel).length).toBe(0);
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
