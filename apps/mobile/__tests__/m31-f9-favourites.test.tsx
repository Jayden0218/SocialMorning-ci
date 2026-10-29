// An empty Favourites page draws the star as an outline, as the drawing does.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-6/README.md defect 10). Written BEFORE the fix: red today.
 * Drawing: design-pulse2 shell.html `favourites--empty`: `glowTile('star', 110, -6)`; kit.js draws every icon as an outline (the `star` path is stroked, not filled), so the glowing tile
 * carries an OUTLINE star — the build passes the filled `star` (`GlowTile icon="star"`, app/favourites.tsx); the Ionicons outline is `star-outline`.
 * (The hot star in the corner of a favourite's cover tile is a filled one in the drawing's `favourites--screen` and stays.)
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockLoad = jest.fn();
const mockSeek = jest.fn();
const mockEdit = jest.fn();
const mockDeleteMoment = jest.fn();
const mockPlay = jest.fn();
const mockOpen = jest.fn();
let mockListener: { listenerId: string; displayName: string } | undefined = { listenerId: 'me', displayName: 'Mei Lin' };
let mockFavs: unknown[] = [];
let mockFavComments: unknown[] = [];
let mockMoments: unknown[] = [];
let mockEpisodes: Record<string, unknown> = {};
let mockPlayable = true;
let mockPlaylists: () => Promise<unknown> = () => Promise.resolve([]);
let mockPlaylist: () => Promise<unknown> = () => Promise.resolve({});
let mockListening: (range: string) => Promise<unknown> = () => Promise.resolve({});
const mockStores = {
  settings: { get: () => undefined, set: () => undefined },
  feeds: { getShow: () => ({ title: 'Morning Notes', imageUrl: undefined }), getEpisode: (id: string) => mockEpisodes[id] },
};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/favourites',
  useLocalSearchParams: () => ({ id: 'p1' }),
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast, useDownloads: () => ({}) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/me/favourites', () => ({ listFavourites: () => mockFavs }));
jest.mock('@/me/fav-comments', () => ({ listFavComments: () => mockFavComments }));
jest.mock('@/me/moments', () => ({ listMoments: () => mockMoments, editMoment: (...a: unknown[]) => mockEdit(...a), deleteMoment: (...a: unknown[]) => mockDeleteMoment(...a), NOTE_MAX: 500 }));
const mockPlayer = { load: mockLoad, seek: mockSeek };
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer, usePlayerSelector: () => true, selectIdle: () => true }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => (mockPlayable ? { id } : undefined) }));
const mockApi = {};
const mockSocial = (): { api: typeof mockApi; listener: typeof mockListener } => ({ api: mockApi, listener: mockListener });
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial() }));
const mockM19 = {
  myPlaylists: () => mockPlaylists(),
  createPlaylist: jest.fn(),
  playlist: () => mockPlaylist(),
  updatePlaylist: jest.fn(() => Promise.resolve()),
  setPlaylistItems: jest.fn(() => Promise.resolve()),
  deletePlaylist: jest.fn(() => Promise.resolve()),
};
jest.mock('@/social/m19-api', () => ({ PLAYLIST_TITLE_MAX: 60, useM19Api: () => mockM19 }));
const mockCards = { open: mockOpen, play: mockPlay };
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => mockCards }));
jest.mock('@/discover/open', () => ({ resolveCard: jest.fn(() => Promise.resolve({ episodeId: 'x' })) }));
jest.mock('@/feeds/fetch', () => ({ refreshShow: jest.fn() }));
jest.mock('@/settings/queue', () => ({ queueEpisode: jest.fn(() => ({ kind: 'queued' })) }));
const mockListeningApi = { listening: (range: string) => mockListening(range) };
jest.mock('@/me/listening-api', () => ({ useListeningApi: () => mockListeningApi }));
jest.mock('@/config/store', () => ({ useSectionTitle: (t: string) => t }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import FavouritesScreen from '../app/favourites';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  [mockPush, mockToast, mockLoad, mockSeek, mockEdit, mockDeleteMoment, mockPlay, mockOpen, mockM19.createPlaylist, mockM19.updatePlaylist, mockM19.setPlaylistItems, mockM19.deletePlaylist].forEach((m) => m.mockClear());
  mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
  mockPlayable = true;
  mockM19.createPlaylist.mockReset();
  mockFavs = []; mockFavComments = []; mockMoments = []; mockEpisodes = {};
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); await Promise.resolve(); await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => hosts(r, (n) => n.props['testID'] === id);
const classOf = (n: ReactTestInstance): string => String(n.props['className'] ?? '');
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const comp = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  return n;
};
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = comp(r, label);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
/** The innermost element with this spoken name that carries a class (a kit button wraps its Pressable). */
const inner = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const all = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['className'] === 'string');
  const n = all[all.length - 1];
  if (!n) throw new Error(`nothing styled is named "${label}"`);
  return n;
};
const type = async (r: ReactTestRenderer, label: string, text: string): Promise<void> => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onChangeText'] === 'function')[0];
  if (!n) throw new Error(`no field "${label}"`);
  await act(async () => { n.props['onChangeText'](text); await Promise.resolve(); });
};
const NOW = Date.now();


describe('F9-14 Favourites, nothing starred (favourites--empty)', () => {
  it('the glowing tile holds the outline star (star-outline), not the filled one', async () => {
    mockFavs = [];
    const r = await render(createElement(FavouritesScreen));
    const tile = byId(r, 'glow-tile')[0]!;
    const names = tile.findAll((n) => typeof n.props['name'] === 'string').map((n) => String(n.props['name']));
    expect(names).toContain('star-outline');
    expect(names).not.toContain('star');
  });
});
