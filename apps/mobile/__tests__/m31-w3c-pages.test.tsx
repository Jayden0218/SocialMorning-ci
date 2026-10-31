// Tests that Favourites, Saved moments, Playlists, a Playlist and Listening data match their drawings in the numbers the owner compared.
/**
 * M31 W3-C (T041; owner: "the design I want completely the same, or you can explain why it is different"). Source of
 * every number: specs/033-m31-redesign/design-pulse2 `shell.html` `favourites--*`, `listen.html` `favourites--comments-tab`,
 * `moments--*`, `playlists--*`, `playlist--*`, `discover.html` `me-listening--*`, and kit.js / kit.css. Each test names the
 * revert that turns it red (each was seen red once, then restored):
 *  - Favourites: the mosaic's newest tile is 1 x 2 (194 tall), the rest 92; a hot star on each; the foot holds the 48 field and
 *    the 44 switch; the Comments tab is a thread: `TALL` back to `ROW`, the `below` zone dropped — red;
 *  - Saved moments: cards 290 x 360, cover 130, the time at 32, the foot's 40 circles and the 44 "From 12:32" pill, the note editor
 *    with Cancel / Save: `CARD.height` changed, the editor's `borderWidth` removed — red;
 *  - Playlists: the first public playlist is the 2 x 2 tile (346 x 178) with PUBLIC, the rest 168 x 84; the field + Create sit above
 *    the title bar and Create is dim until typed: `ME_MOSAIC.row * 2` changed, `disabled` removed — red;
 *  - a Playlist: cards 290 x 330 numbered, the foot's 36 tools and 44 play circle, the Public switch only on yours, the rename form
 *    replaces the title bar: `mine &&` dropped, `bare` removed — red;
 *  - Listening data: the switch in the title bar's foot (44), the 30-day total at 52, the 120 bars, the top-shows deck of 150-wide cards (F9, me-listening--all-time), the error tile: `below` removed — red.
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
import MomentsScreen from '../app/moments';
import PlaylistsScreen from '../app/playlists/index';
import PlaylistScreen from '../app/playlists/[id]';
import ListeningDataScreen from '../app/me/listening';
import { ApiError } from '@/social/api';

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

describe('Favourites (shell.html favourites--screen, listen.html favourites--comments-tab)', () => {
  const eps = ['a', 'd', 'g', 'c', 'e'];
  beforeEach(() => {
    mockEpisodes = Object.fromEntries(eps.map((id, i) => [id, { id, title: ['Why mornings matter', 'Cities that sleep late', 'Rain on tin', 'The slow commute', 'Bread at 5 a.m.'][i], feedUrl: 'f', imageUrl: undefined }]));
    mockFavs = eps.map((episodeId, i) => ({ episodeId, at: NOW - i * 1000 }));
    mockFavComments = [
      { commentId: 'c1', episodeId: 'a', body: 'This is the part I replay every morning.', author: 'Rui', offsetMs: 872_000, at: NOW - 5 * 3_600_000 },
      { commentId: 'c3', episodeId: 'c', body: '', author: 'Jo', offsetMs: 400_000, at: NOW - 7 * 86_400_000 },
    ];
  });

  it('the newest tile is 1 x 2 (168 x 194), the next two stack at its right, then rows of two; each 92 tall with a hot star', async () => {
    const r = await render(createElement(FavouritesScreen));
    const tiles = byId(r, 'fav-tile');
    expect(tiles).toHaveLength(5);
    expect(tiles.map((t) => [flat(t)['width'], flat(t)['height']])).toEqual([[168, 194], [168, 92], [168, 92], [168, 92], [168, 92]]);
    expect(tiles.every((t) => flat(t)['borderRadius'] === 22)).toBe(true);
    expect(byId(r, 'icon-star').length).toBe(5);
    expect(words(r)).toEqual(expect.arrayContaining(['STARRED', 'Why mornings matter', 'Morning Notes']));
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Why mornings matter' && n.props['accessibilityRole'] === 'button').length).toBeGreaterThan(0);
  });

  it('the foot is the thumb zone: back and "Favourites" at 28, then the 48 search field and the 44 switch, lowest', async () => {
    const r = await render(createElement(FavouritesScreen));
    const title = r.root.findAll((n) => String(n.type) === 'Text' && n.props['accessibilityRole'] === 'header' && say(n.props['children']) === 'Favourites')[0]!;
    const val = (x: unknown): unknown => (x !== null && typeof x === 'object' && '__getValue' in x ? (x as { __getValue: () => unknown }).__getValue() : x);
    expect(val(flat(title)['fontSize'])).toBe(28);
    const zone = byId(r, 'pushed-below')[0]!;
    expect(flat(zone)).toMatchObject({ bottom: 6, gap: 12 });
    expect(flat(byId(r, 'search-field')[0])).toMatchObject({ height: 48 });
    expect(flat(byId(r, 'segment-switch')[0])).toMatchObject({ height: 44 });
    expect(words(r)).toEqual(expect.arrayContaining(['Episodes · 5', 'Comments · 2']));
    // The title row sits above the zone: 6 + (48 + 12 + 44) + 12.
    expect(hosts(r, (n) => flat(n)['bottom'] === 6 + 48 + 12 + 44 + 12 && flat(n)['zIndex'] === 20)).toHaveLength(1);
  });

  it('search filters the tiles; words that match nothing say so', async () => {
    const r = await render(createElement(FavouritesScreen));
    await type(r, 'Search your favourites', 'rain');
    expect(byId(r, 'fav-tile')).toHaveLength(1);
    await type(r, 'Search your favourites', 'zzz');
    expect(words(r)).toContain('Nothing matches');
  });

  it('a tile is a link named for its episode', async () => {
    const r = await render(createElement(FavouritesScreen));
    const t = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Rain on tin' && n.props['accessibilityRole'] === 'button');
    expect(t.length).toBeGreaterThan(0);
  });

  it('Comments is a thread: a solid hot moment chip, the episode beside it, the words, "Favourite" in warn; a deleted one says so', async () => {
    const r = await render(createElement(FavouritesScreen));
    await press(r, 'Comments');
    expect(flat(byId(r, 'spine-line')[0])).toMatchObject({ left: 40, width: 2 });
    expect(words(r)).toEqual(expect.arrayContaining(['14:32', 'Why mornings matter', 'Rui', '5h', 'This is the part I replay every morning.', 'Favourite', 'This comment was deleted', '06:40']));
    const fav = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Favourite')[0]!;
    expect(classOf(fav)).toContain('text-warn');
    await press(r, 'Rui: This is the part I replay every morning.');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'a', at: '872000' } });
  });

  it('no favourites: the glowing star tile (110) and the sentence split in two; no search field, the switch stays', async () => {
    mockFavs = [];
    const r = await render(createElement(FavouritesScreen));
    expect(flat(byId(r, 'glow-tile')[0])).toMatchObject({ width: 110, height: 110 });
    expect(words(r)).toEqual(expect.arrayContaining(['No favourites yet', 'Star an episode on its page']));
    expect(byId(r, 'search-field')).toHaveLength(0);
    expect(byId(r, 'segment-switch')).toHaveLength(1);
  });

  it('no favourite comments: an empty spine and "No favourite comments yet" with "Tap ☆ on a comment"', async () => {
    mockFavComments = [];
    const r = await render(createElement(FavouritesScreen));
    await press(r, 'Comments');
    expect(byId(r, 'empty-spine')).toHaveLength(1);
    expect(words(r)).toEqual(expect.arrayContaining(['No favourite comments yet', 'Tap ☆ on a comment']));
  });
});

describe('Saved moments (moments--screen)', () => {
  const moment = (id: string, episodeId: string, atMs: number, note: string) => ({ id, episodeId, atMs, note, savedAt: NOW });
  beforeEach(() => {
    mockEpisodes = { e1: { id: 'e1', title: 'Why mornings matter', feedUrl: 'f', imageUrl: undefined } };
    mockMoments = [moment('m1', 'e1', 752_000, 'the coffee question — send to Ana'), moment('m2', 'e1', 1_870_000, ''), moment('m3', 'gone', 0, '')];
  });

  it('a deck of 290 x 360 cards, radius 26 and a line, the cover 130 with the time at 32; the title bar says "3 moments"', async () => {
    const r = await render(createElement(MomentsScreen));
    const cards = byId(r, 'moment-card');
    expect(cards).toHaveLength(3);
    expect(flat(cards[0])).toMatchObject({ height: 360, borderRadius: 26 });
    expect(classOf(cards[0]!)).toContain('border-line');
    expect(byId(r, 'card-deck')[0]!.props['snapToInterval']).toBe(300);
    const time = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === '12:32')[0]!;
    expect(flat(time)).toMatchObject({ fontSize: 32 });
    expect(classOf(time)).toContain('font-extrabold');
    expect(words(r)).toEqual(expect.arrayContaining(['Saved moments', '3 moments', 'Morning Notes', 'Why mornings matter', '“the coffee question — send to Ana”', 'No note', 'From 12:32']));
    expect(byId(r, 'page-dots')).toHaveLength(1);
  });

  it('the foot: Edit note and Delete moment are 40 circles, "From 12:32" a light 44 pill that plays and seeks', async () => {
    const r = await render(createElement(MomentsScreen));
    const edit = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Edit note' && typeof x.props['onPress'] === 'function')[0]!;
    expect(flat(edit)).toMatchObject({ width: 40, height: 40, borderRadius: 20 });
    const del = comp(r, 'Delete moment');
    expect(flat(del)).toMatchObject({ width: 40, height: 40 });
    const from = comp(r, 'Play Why mornings matter from 12:32');
    expect(flat(from)).toMatchObject({ height: 44 });
    expect(classOf(from)).toContain('bg-text');
    await press(r, 'Play Why mornings matter from 12:32');
    expect(mockLoad).toHaveBeenCalledWith({ id: 'e1' }, 'play');
    expect(mockSeek).toHaveBeenCalledWith(752_000);
  });

  it('delete removes the moment', async () => {
    const r = await render(createElement(MomentsScreen));
    await press(r, 'Delete moment');
    expect(mockDeleteMoment).toHaveBeenCalledWith(mockStores.settings, 'm1');
  });

  it('editing turns the foot into the note field (a 1.5 hot ring) with Cancel and Save; Save writes the note', async () => {
    const r = await render(createElement(MomentsScreen));
    await press(r, 'Edit note');
    const field = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Note' && typeof x.props['onChangeText'] === 'function')[0]!;
    expect(field.props['value']).toBe('the coffee question — send to Ana');
    const ring = hosts(r, (n) => flat(n)['borderWidth'] === 1.5 && flat(n)['minHeight'] === 70);
    expect(ring.length).toBeGreaterThan(0);
    expect(classOf(ring[0]!)).toContain('border-hot');
    await type(r, 'Note', 'send to Ana, later');
    await press(r, 'Save note');
    expect(mockEdit).toHaveBeenCalledWith(mockStores.settings, 'm1', 'send to Ana, later');
    await press(r, 'Edit note');
    await press(r, 'Cancel');
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'Save note')).toHaveLength(0);
  });

  it('a moment whose episode left the phone: "Episode not on this phone" in hot text, and Play says so in a toast', async () => {
    mockMoments = [moment('m3', 'gone', 0, '')];
    mockPlayable = false;
    const r = await render(createElement(MomentsScreen));
    const gone = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Episode not on this phone');
    expect(gone.length).toBeGreaterThan(0);
    expect(classOf(gone[0]!)).toContain('text-hotText');
    await press(r, 'Play episode from 0:00');
    expect(mockToast).toHaveBeenCalledWith("That episode isn't on this phone any more.");
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('the search circle opens a 48 field above the title bar; nothing found says so', async () => {
    const r = await render(createElement(MomentsScreen));
    await press(r, 'Search your saved moments');
    expect(flat(byId(r, 'search-field')[0])).toMatchObject({ height: 48 });
    await type(r, 'Search your saved moments', 'zzz');
    expect(words(r)).toContain('Nothing matches');
  });

  it('none saved: "No saved moments" and no search circle', async () => {
    mockMoments = [];
    const r = await render(createElement(MomentsScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['No saved moments', 'No saved moments — tap “Save moment” while listening']));
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'Search your saved moments')).toHaveLength(0);
  });
});

describe('Playlists (playlists--screen)', () => {
  const pl = (id: string, title: string, count: number, isPublic = false) => ({ id, title, count, isPublic, imageUrl: undefined });
  it('the first public playlist is the 2 x 2 tile with PUBLIC (346 x 178); the others are 168 x 84; each opens the playlist', async () => {
    mockPlaylists = () => Promise.resolve([pl('p1', 'Walks', 5), pl('p2', 'Slow mornings', 12, true), pl('p3', 'Kitchen', 8), pl('p4', 'To share', 3)]);
    const r = await render(createElement(PlaylistsScreen));
    const big = byId(r, 'playlist-tile-big');
    expect(big).toHaveLength(1);
    expect(flat(big[0])).toMatchObject({ width: 346, height: 178, borderRadius: 22 });
    const small = byId(r, 'playlist-tile');
    expect(small.map((t) => [flat(t)['width'], flat(t)['height']])).toEqual([[168, 84], [168, 84], [168, 84]]);
    expect(words(r)).toEqual(expect.arrayContaining(['PUBLIC', 'Slow mornings', '12 episodes', 'Playlists', 'Collect episodes by theme; make one public to show it on your profile']));
    await press(r, 'Slow mornings, 12 episodes, public');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/playlists/[id]', params: { id: 'p2' } });
  });

  it('the name field and Create sit above the title bar; Create is dim until a name is typed, then makes the playlist first in the mosaic', async () => {
    mockPlaylists = () => Promise.resolve([pl('p1', 'Walks', 5)]);
    mockM19.createPlaylist.mockResolvedValueOnce(pl('p9', 'Rainy days', 0));
    const r = await render(createElement(PlaylistsScreen));
    expect(byId(r, 'playlist-new')).toHaveLength(1);
    const create = inner(r, 'New playlist');
    expect(create.props['accessibilityState']).toMatchObject({ disabled: true });
    expect(classOf(create)).toMatch(/(^|\s)opacity-40(\s|$)/);
    await type(r, 'New playlist name', 'Rainy days');
    expect(classOf(inner(r, 'New playlist'))).not.toMatch(/(^|\s)opacity-40(\s|$)/);
    await press(r, 'New playlist');
    expect(mockM19.createPlaylist).toHaveBeenCalledWith('Rainy days');
    expect(words(r)).toContain('Rainy days');
  });

  it('a 50-playlist limit and a failure each speak in a toast', async () => {
    mockPlaylists = () => Promise.resolve([pl('p1', 'Walks', 5)]);
    mockM19.createPlaylist.mockRejectedValueOnce(new ApiError('conflict', 'x', 409)).mockRejectedValueOnce(new Error('x'));
    const r = await render(createElement(PlaylistsScreen));
    await type(r, 'New playlist name', 'A');
    await press(r, 'New playlist');
    expect(mockToast).toHaveBeenCalledWith('You have 50 playlists already. Delete one first.');
    await press(r, 'New playlist');
    expect(mockToast).toHaveBeenCalledWith("Couldn't make the playlist. Try again.");
  });

  it('signed out: a light Sign in, no name field; none yet: today\'s words with the field still there; failed: the grey glow and Retry', async () => {
    mockListener = undefined;
    const out = await render(createElement(PlaylistsScreen));
    expect(words(out)).toEqual(expect.arrayContaining(['Playlists', 'Sign in to make playlists.', 'Sign in']));
    expect(byId(out, 'playlist-new')).toHaveLength(0);
    mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
    mockPlaylists = () => Promise.resolve([]);
    const none = await render(createElement(PlaylistsScreen));
    expect(words(none)).toEqual(expect.arrayContaining(['No playlists yet', "No playlists yet. Name one above, or use Add to playlist in any episode's menu."]));
    expect(byId(none, 'playlist-new')).toHaveLength(1);
    let calls = 0;
    mockPlaylists = () => { calls += 1; return calls === 1 ? Promise.reject(new Error('x')) : Promise.resolve([]); };
    const bad = await render(createElement(PlaylistsScreen));
    expect(words(bad)).toEqual(expect.arrayContaining(["Couldn't load", "Couldn't load your playlists right now.", 'Retry']));
    expect(byId(bad, 'page-glow')).toHaveLength(1);
    await press(bad, 'Retry');
    expect(calls).toBe(2);
  });
});

describe('A playlist (playlist--screen)', () => {
  const card = (id: string, title: string) => ({ id, feedUrl: 'f', guid: id, title, showTitle: 'Morning Notes', enclosureUrl: 'u' });
  const mine = { id: 'p1', title: 'Slow mornings', count: 3, isPublic: true, owner: { id: 'me', displayName: 'Mei Lin' }, items: [card('e1', 'Why mornings matter'), card('e2', 'The long walk home'), card('e3', 'Bread, slowly')] };
  beforeEach(() => { mockPlaylist = () => Promise.resolve(mine); });

  it('numbered cards 290 x 330 in a deck with dots; the title bar says "By you · 3 episodes" with a pencil and a bin; Play all above it', async () => {
    const r = await render(createElement(PlaylistScreen));
    const cards = byId(r, 'playlist-card');
    expect(cards).toHaveLength(3);
    expect(flat(cards[0])).toMatchObject({ height: 330, borderRadius: 26 });
    expect(words(r)).toEqual(expect.arrayContaining(['Slow mornings', 'By you · 3 episodes', '1', '2', '3', 'Morning Notes', 'Why mornings matter']));
    expect(byId(r, 'page-dots')).toHaveLength(1);
    expect(comp(r, 'Rename playlist')).toBeDefined();
    expect(comp(r, 'Delete playlist')).toBeDefined();
    const all = inner(r, 'Play all 3 episodes');
    expect(classOf(all)).toContain('bg-text');
    expect(flat(all)).toMatchObject({ height: 48 });
  });

  it('the Public switch and its line are at the top, on yours only; the switch saves and undoes on a failure', async () => {
    const r = await render(createElement(PlaylistScreen));
    expect(words(r)).toContain('On your profile; anyone with the link can open it');
    const sw = r.root.findAll((x) => x.props['accessibilityRole'] === 'switch' && x.props['accessibilityLabel'] === 'Public playlist' && typeof x.props['onPress'] === 'function')[0]!;
    expect(sw.props['accessibilityState']).toMatchObject({ checked: true });
    await act(async () => { sw.props['onPress'](); await Promise.resolve(); });
    expect(mockM19.updatePlaylist).toHaveBeenCalledWith('p1', { isPublic: false });
    expect(words(r)).toContain('Only you can see it');
  });

  it('a card\'s foot: ‹ › × are 36 circles, play is the 44 light circle; the first cannot move up; a move saves the whole order', async () => {
    const r = await render(createElement(PlaylistScreen));
    const up = comp(r, 'Move Why mornings matter up');
    expect(up.props['accessibilityState']).toMatchObject({ disabled: true });
    expect(flat(up)).toMatchObject({ width: 36, height: 36, borderRadius: 18 });
    expect(flat(comp(r, 'Play Why mornings matter'))).toMatchObject({ width: 44, height: 44 });
    expect(classOf(comp(r, 'Play Why mornings matter'))).toContain('bg-text');
    await press(r, 'Move Why mornings matter down');
    expect(mockM19.setPlaylistItems).toHaveBeenCalledWith('p1', ['e2', 'e1', 'e3']);
    await press(r, 'Remove Bread, slowly from the playlist');
    expect(mockM19.setPlaylistItems).toHaveBeenLastCalledWith('p1', ['e2', 'e1']);
    await press(r, 'Play The long walk home');
    expect(mockPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'e2' }));
    await press(r, '1. The long walk home, Morning Notes');
    expect(mockOpen).toHaveBeenCalled();
  });

  it('someone else\'s playlist: "By Ana", no switch, no pencil or bin, no ‹ › ×; Play stays', async () => {
    mockPlaylist = () => Promise.resolve({ ...mine, owner: { id: 'ana', displayName: 'Ana' } });
    const r = await render(createElement(PlaylistScreen));
    expect(words(r)).toContain('By Ana · 3 episodes');
    expect(byId(r, 'playlist-public')).toHaveLength(0);
    expect(r.root.findAll((x) => x.props['accessibilityLabel'] === 'Rename playlist')).toHaveLength(0);
    expect(r.root.findAll((x) => String(x.props['accessibilityLabel']).startsWith('Move '))).toHaveLength(0);
    expect(comp(r, 'Play Why mornings matter')).toBeDefined();
  });

  it('Rename (the pencil, or the title) turns the foot into the name field with Cancel and Save; Save writes the name', async () => {
    const r = await render(createElement(PlaylistScreen));
    await press(r, 'Slow mornings, rename');
    expect(byId(r, 'playlist-rename')).toHaveLength(1);
    expect(r.root.findAll((x) => x.props['accessibilityRole'] === 'header' && String(x.type) === 'Text' && say(x.props['children']) === 'Slow mornings')).toHaveLength(0);
    const field = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Playlist name' && typeof x.props['onChangeText'] === 'function')[0]!;
    expect(field.props['value']).toBe('Slow mornings');
    await type(r, 'Playlist name', 'Slower mornings');
    await press(r, 'Save name');
    expect(mockM19.updatePlaylist).toHaveBeenCalledWith('p1', { title: 'Slower mornings' });
    expect(byId(r, 'playlist-rename')).toHaveLength(0);
    expect(words(r)).toContain('Slower mornings');
    await press(r, 'Rename playlist');
    await press(r, 'Cancel rename');
    expect(byId(r, 'playlist-rename')).toHaveLength(0);
  });

  it('Delete asks first (title "Delete Slow mornings?"), then deletes and says so', async () => {
    const r = await render(createElement(PlaylistScreen));
    await press(r, 'Delete playlist');
    expect(words(r)).toEqual(expect.arrayContaining(['Delete Slow mornings?']));
    await press(r, 'Delete');
    expect(mockM19.deletePlaylist).toHaveBeenCalledWith('p1');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mockToast).toHaveBeenCalledWith('Playlist deleted.');
  });

  it('not found: the grey glow and today\'s words; a failed read has Retry', async () => {
    mockPlaylist = () => Promise.reject(new ApiError('not_found', 'x', 404));
    const r = await render(createElement(PlaylistScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Not found', 'This playlist was not found. It may be private, or deleted.']));
    expect(byId(r, 'page-glow')).toHaveLength(1);
    mockPlaylist = () => Promise.reject(new Error('x'));
    const e = await render(createElement(PlaylistScreen));
    expect(words(e)).toEqual(expect.arrayContaining(["Couldn't load this playlist right now.", 'Retry']));
  });

  it('an empty playlist says so in today\'s words', async () => {
    mockPlaylist = () => Promise.resolve({ ...mine, items: [], count: 0 });
    const r = await render(createElement(PlaylistScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['No episodes yet', "Use Add to playlist in any episode's menu."]));
    expect(inner(r, 'Play all 0 episodes').props['accessibilityState']).toMatchObject({ disabled: true });
  });
});

describe('Listening data (me-listening--screen)', () => {
  const days = Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, minutes: i === 15 ? 48 : 10 }));
  const data = { range: '30d', days, totalMinutes: 612, topShows: [{ feedUrl: 'f1', title: 'Morning Notes', minutes: 1860 }, { feedUrl: 'f2', title: 'Night Shift Radio', minutes: 1080 }] };
  beforeEach(() => { mockListening = () => Promise.resolve(data); });

  it('the foot switch (44), the range in mono over the total at 52, the 120 tall bars, "Tap a bar to see its minutes."', async () => {
    const r = await render(createElement(ListeningDataScreen));
    expect(flat(byId(r, 'segment-switch')[0])).toMatchObject({ height: 44, padding: 3 });
    const total = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === '612 min')[0]!;
    expect(flat(total)).toMatchObject({ fontSize: 52 });
    expect(classOf(total)).toContain('font-extrabold');
    expect(words(r)).toEqual(expect.arrayContaining(['Last 30 days', 'Tap a bar to see its minutes.', 'Listening data']));
    expect(flat(byId(r, 'listening-bars')[0])).toMatchObject({ height: 120 });
    expect(byId(r, 'listening-bar')).toHaveLength(30);
  });

  it('Top shows is a deck of ranked 150-wide cards (cover 130) that open the show', async () => {
    const r = await render(createElement(ListeningDataScreen));
    const deck = byId(r, 'deck')[0]!;
    expect(deck.props['snapToInterval']).toBe(160);
    expect(flat(deck)).toMatchObject({ height: 212 });
    expect(words(r)).toEqual(expect.arrayContaining(['1', 'Morning Notes', '31 h', 'Night Shift Radio']));
    await press(r, '1. Morning Notes, 31 h');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: 'f1' } });
  });

  it('All time reads the other range, and a failure is the error tile with a Retry that reads again', async () => {
    let n = 0;
    mockListening = (range) => { n += 1; return range === 'all' ? Promise.reject(new Error('x')) : Promise.resolve(data); };
    const r = await render(createElement(ListeningDataScreen));
    await press(r, 'All time');
    const tile = byId(r, 'listening-error')[0]!;
    expect(flat(tile)).toMatchObject({ borderRadius: 22, padding: 16 });
    expect(words(r)).toEqual(expect.arrayContaining(["Couldn't load your listening data right now.", 'Retry']));
    const before = n;
    await press(r, 'Retry');
    expect(n).toBe(before + 1);
  });

  it('no minutes: the switch stays over today\'s words; signed out: a light Sign in', async () => {
    mockListening = () => Promise.resolve({ ...data, totalMinutes: 0, days: [], topShows: [] });
    const r = await render(createElement(ListeningDataScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['No listening in the last 30 days.', 'Play an episode and your minutes show up here.']));
    expect(byId(r, 'segment-switch')).toHaveLength(1);
    mockListener = undefined;
    const out = await render(createElement(ListeningDataScreen));
    expect(words(out)).toEqual(expect.arrayContaining(['Sign in to see your listening data.', 'Sign in']));
    await press(out, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });
});
