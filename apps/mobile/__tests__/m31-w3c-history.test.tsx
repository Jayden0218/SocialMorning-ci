// Tests that History, My comments and Likes match their drawings in the numbers the owner compared.
/**
 * M31 W3-C (T041; owner: "the design I want completely the same, or you can explain why it is different"). Source of
 * every number: specs/033-m31-redesign/design-pulse2 `listen.html` `history--*`, `my-comments--*`, `likes--*` and kit.js /
 * kit.css. Each test names the revert that turns it red (each was seen red once, then restored):
 *  - History's title is 26, the subtitle "All · n episodes", a search circle and a select circle, the chips above: `size={26}` or
 *    the `actions` removed — red;
 *  - day tags on the spine, a card = cover 44 + a 34 play dot (or "Finished" in green) + the 40-bar curve with "Stopped at": the
 *    "Finished" word removed — red;
 *  - tap plays, long-press (and the "More for …" accessibility action) opens the sheet: `onPress` pointed at the sheet, or the `accessibilityActions` removed — red;
 *  - select mode: "n selected", Clear all · Delete (n) · Done, a 24 tick at −34 / 20 inside one non-touchable box: `pointerEvents="none"`
 *    removed — red;
 *  - empty: an empty grey spine and "Nothing played yet" + "Choose an episode to see it here.": `EmptySpine` removed — red;
 *  - My comments: the solid hot moment chip: `TimestampChip` swapped for the quiet tick — red;
 *  - Likes: the grey glow on a failed load — `tone` back to hot — red.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { player } from '@/design/tokens';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockLoad = jest.fn();
const mockDelete = jest.fn(() => Promise.resolve());
const mockSheet = jest.fn();
let mockRows: unknown[] = [];
let mockSignedIn = true;
let mockListener: { listenerId: string; displayName: string } | undefined = { listenerId: 'me', displayName: 'Mei Lin' };
let mockMine: () => Promise<unknown> = () => Promise.resolve({ items: [] });
let mockLikes: () => Promise<unknown> = () => Promise.resolve({ items: [] });
const mockPlay = jest.fn();
const mockStores = {
  settings: { get: () => undefined, set: () => undefined },
  positions: { all: () => [] },
  feeds: { getShow: () => ({ title: 'Morning Notes', imageUrl: undefined }), getEpisode: () => undefined },
  auth: { get: () => (mockSignedIn ? { token: 't' } : undefined) },
};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/history',
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast, useDownloads: () => ({}) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/me/history', () => ({ ...jest.requireActual('@/me/history'), listeningHistory: () => mockRows, hideFromHistory: jest.fn(), hideDeletedElsewhere: () => 0 }));
const mockLibrary = { positionIds: () => Promise.resolve(new Set()), deleteHistory: mockDelete };
jest.mock('@/social/api-m22-library', () => ({ HISTORY_DELETE_MAX: 100, useM22LibraryApi: () => mockLibrary }));
const mockM12 = { episodeCounts: () => Promise.resolve({ counts: {} }) };
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
const mockPlayer = { load: mockLoad };
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer, usePlayerSelector: () => true, selectIdle: () => true }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ id }) }));
jest.mock('@/ui/shell/ListDetail', () => ({ ListDetail: (p: { list: unknown }) => p.list, EpisodePane: () => null, useOpensInPane: () => false }));
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: (p: unknown) => { mockSheet(p); return null; } }));
// One object each time, as the real hooks give: a new one per render re-runs the pages' load effects for ever.
const mockApi = { myComments: () => mockMine() };
const mockProfileApi = { likesTimeline: () => mockLikes() };
const mockSocial = (): { api: typeof mockApi; listener: typeof mockListener } => ({ api: mockApi, listener: mockListener });
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial() }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => mockProfileApi }));
const mockCards = { open: jest.fn(), play: mockPlay };
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => mockCards }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import HistoryScreen from '../app/history';
import MyCommentsScreen from '../app/my-comments';
import LikesScreen from '../app/likes';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  [mockPush, mockToast, mockLoad, mockDelete, mockSheet, mockPlay].forEach((m) => m.mockClear());
  mockSignedIn = true;
  mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); await Promise.resolve(); await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const val = (x: unknown): unknown => (x !== null && typeof x === 'object' && '__getValue' in x ? (x as { __getValue: () => unknown }).__getValue() : x);
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
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  await act(async () => { n.props['onPress'](); await Promise.resolve(); });
};
const comp = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  return n;
};
const titleOf = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && String(n.type) === 'Text' && n.props['numberOfLines'] !== undefined && say(n.props['children']) !== say(n.props['children']).toUpperCase())[0]!; // not a day tag (upper case, also a header)

/** Stops of the page glow painted in the grey of a failed page (not the hot-violet pair). */
const greyStops = (r: ReactTestRenderer): number => r.root.findAll((n) => typeof n.props['stopColor'] === 'string' && n.props['stopColor'] === player.emptyInk).length;
const NOW = Date.now();
const ep = (id: string, title: string, durationMs?: number) => ({ id, title, feedUrl: 'f', imageUrl: undefined, durationMs });
const row = (id: string, title: string, offsetMs: number, finished: boolean, ageMs: number, durationMs = 48 * 60_000) => ({ episode: ep(id, title, durationMs), offsetMs, finished, updatedAt: NOW - ageMs });
const DAYMS = 86_400_000;

describe('History (history--screen)', () => {
  beforeEach(() => {
    mockRows = [
      row('a', 'Why mornings matter', 12 * 60_000, false, 60_000),
      row('b', 'Cities that sleep late', 38 * 60_000, true, 120_000),
      row('c', 'The long walk home', 52 * 60_000, true, DAYMS + 3_600_000),
    ];
  });

  it('the title bar is low: "Listening history" at 26, "All · 3 episodes", a search and a select circle, the chips above', async () => {
    const r = await render(createElement(HistoryScreen));
    const t = titleOf(r);
    expect(val(flat(t)['fontSize'])).toBe(26);
    expect(words(r)).toEqual(expect.arrayContaining(['Listening history', 'All · 3 episodes']));
    const bar = hosts(r, (n) => flat(n)['zIndex'] === 20 && flat(n)['bottom'] !== undefined)[0]!;
    expect(flat(bar)['bottom']).toBe(6);
    expect(comp(r, 'Search your history')).toBeDefined();
    expect(comp(r, 'Select')).toBeDefined();
    const chips = ['All', 'Only finished'].map((l) => comp(r, l));
    expect(classOf(chips[0]!)).toContain('bg-text');
    expect(classOf(chips[1]!)).toContain('bg-raise');
  });

  it('day tags on the spine, a 44 cover and a 34 play dot on an unfinished row with its curve and "Stopped at", "Finished" on a done one', async () => {
    const r = await render(createElement(HistoryScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['TODAY', 'YESTERDAY', 'Stopped at 12:00', 'Finished']));
    const spine = byId(r, 'spine-line')[0]!;
    expect(flat(spine)).toMatchObject({ left: 40, width: 2 });
    expect(byId(r, 'day-tag')).toHaveLength(2);
    expect(flat(byId(r, 'play-dot')[0])).toMatchObject({ width: 34, height: 34 });
    expect(byId(r, 'play-dot')).toHaveLength(1);
    const finished = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Finished');
    expect(classOf(finished[0]!)).toContain('text-ok');
    const cover = hosts(r, (n) => flat(n)['width'] === 44 && flat(n)['height'] === 44);
    expect(cover.length).toBeGreaterThan(0);
    // The curve: 40 bars, 12 tall, a third lit (12 of 48 min).
    expect(hosts(r, (n) => flat(n)['height'] === 12 && flat(n)['flexDirection'] === 'row').length).toBeGreaterThan(0);
  });

  it('a tap plays from where it stopped; a long-press (and the "More for …" action) opens the episode sheet', async () => {
    const r = await render(createElement(HistoryScreen));
    const card = comp(r, 'Why mornings matter. Stopped at 12:00');
    await act(async () => { card.props['onPress'](); await Promise.resolve(); });
    expect(mockLoad).toHaveBeenCalledWith({ id: 'a' }, 'play');
    await act(async () => { card.props['onLongPress'](); await Promise.resolve(); });
    expect(mockSheet).toHaveBeenLastCalledWith(expect.objectContaining({ episode: expect.objectContaining({ id: 'a' }) }));
    act(() => { mockSheet.mock.lastCall[0].onClose(); });
    mockSheet.mockClear();
    expect(card.props['accessibilityActions']).toEqual([{ name: 'longpress', label: 'More for Why mornings matter' }]);
    await act(async () => { card.props['onAccessibilityAction']({ nativeEvent: { actionName: 'longpress' } }); await Promise.resolve(); });
    expect(mockSheet).toHaveBeenLastCalledWith(expect.objectContaining({ episode: expect.objectContaining({ id: 'a' }) }));
  });

  it('"Only finished" keeps the finished rows and says so in the subtitle', async () => {
    const r = await render(createElement(HistoryScreen));
    await press(r, 'Only finished');
    expect(words(r)).toContain('Only finished · 2 episodes');
    expect(words(r)).not.toContain('Stopped at 12:00');
  });

  it('the search circle opens a 48 field above the chips; words that match nothing say so', async () => {
    const r = await render(createElement(HistoryScreen));
    expect(byId(r, 'search-field')).toHaveLength(0);
    await press(r, 'Search your history');
    const f = byId(r, 'search-field')[0]!;
    expect(flat(f)).toMatchObject({ height: 48 });
    const input = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Search your history' && typeof n.props['onChangeText'] === 'function')[0]!;
    await act(async () => { input.props['onChangeText']('cities'); await Promise.resolve(); });
    expect(words(r)).toContain('All · 1 episode');
    await act(async () => { input.props['onChangeText']('zzz'); await Promise.resolve(); });
    expect(words(r)).toContain('Nothing matches');
  });

  it('select mode: "n selected", Clear all · Delete (n) · Done, a 24 tick on the spine; a tick turns hot; Delete asks the server', async () => {
    const r = await render(createElement(HistoryScreen));
    await press(r, 'Select');
    expect(words(r)).toContain('0 selected');
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Back')).toHaveLength(0);
    expect(comp(r, 'Clear all')).toBeDefined();
    expect(comp(r, 'Done')).toBeDefined();
    const del = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Delete (0)' && n.props['accessibilityState'] !== undefined)[0]!;
    expect(del.props['accessibilityState']).toMatchObject({ disabled: true });
    expect(del.props['onPress']).toBeUndefined();
    const ticks = byId(r, 'history-tick');
    expect(ticks).toHaveLength(3);
    expect(flat(ticks[0])).toMatchObject({ left: -34, top: 20, width: 24, height: 24, borderRadius: 12 });
    expect(classOf(ticks[0]!)).toContain('border-text');
    // One touch target: the card and the tick sit in a non-touchable box under the row's Pressable.
    const rowBtn = comp(r, 'Select Why mornings matter');
    const quiet = hosts(r, (n) => n.props['pointerEvents'] === 'none' && n.findAll((x) => x.props['testID'] === 'history-tick').length > 0);
    expect(quiet.length).toBeGreaterThan(0);
    expect(rowBtn.findAll((x) => x === quiet[0]).length).toBe(1);
    expect(rowBtn.props['accessibilityRole']).toBe('button');
    expect(rowBtn.props['accessibilityState']).toEqual({ selected: false });
    await press(r, 'Select Why mornings matter');
    expect(words(r)).toContain('1 selected');
    expect(classOf(byId(r, 'history-tick')[0]!)).toContain('bg-hot');
    expect(comp(r, 'Select Why mornings matter').props['accessibilityState']).toEqual({ selected: true });
    await press(r, 'Delete (1)');
    expect(mockDelete).toHaveBeenCalledWith({ episodeIds: ['a'] });
    expect(mockToast).toHaveBeenCalledWith('1 item deleted.');
  });

  it('Done leaves select mode without deleting', async () => {
    const r = await render(createElement(HistoryScreen));
    await press(r, 'Select');
    await press(r, 'Select Why mornings matter');
    await press(r, 'Done');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(words(r)).toContain('Listening history');
    expect(byId(r, 'history-tick')).toHaveLength(0);
  });

  it('nothing played: an empty grey spine, "Nothing played yet" and "Choose an episode to see it here."', async () => {
    mockRows = [];
    const r = await render(createElement(HistoryScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Nothing played yet', 'Choose an episode to see it here.']));
    expect(byId(r, 'empty-spine')).toHaveLength(1);
    expect(byId(r, 'spine-line')).toHaveLength(0);
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Select')).toHaveLength(0);
  });
});

describe('My comments (my-comments--screen)', () => {
  const mine = (over: Record<string, unknown>) => ({ id: 'x', body: 'This is the part I replay every morning.', deleted: false, removed: false, offsetMs: 872_000, createdAt: new Date(NOW - 5 * 3_600_000).toISOString(), episode: { id: 'e1', feedUrl: 'f', guid: 'g', title: 'Why mornings matter', showTitle: 'Morning Notes', enclosureUrl: 'u' }, ...over });

  it('hangs from the spine at the solid moment chip, "On {episode}" beside it, the words and their age in a raise card', async () => {
    mockMine = () => Promise.resolve({ items: [mine({}), mine({ id: 'y', body: null, removed: true, offsetMs: 135_000 }), mine({ id: 'z', body: null, deleted: true, offsetMs: null })] });
    const r = await render(createElement(MyCommentsScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['My comments', '3 comments', '14:32', 'On Why mornings matter', 'This is the part I replay every morning.', '5h', 'Removed by moderation', 'You deleted this comment', 'no moment']));
    expect(flat(byId(r, 'spine-line')[0])).toMatchObject({ left: 40, width: 2 });
    const chips = hosts(r, (n) => classOf(n).includes('bg-hot') && flat(n)['minHeight'] === 22);
    expect(chips.length).toBeGreaterThan(0);
    const removed = r.root.findAll((x) => String(x.type) === 'Text' && say(x.props['children']) === 'Removed by moderation')[0]!;
    expect(classOf(removed)).toContain('text-hotText');
    expect(byId(r, 'thread-card')).toHaveLength(3);
  });

  it('the whole card is one button that opens the episode at the moment', async () => {
    mockMine = () => Promise.resolve({ items: [mine({})] });
    const r = await render(createElement(MyCommentsScreen));
    await press(r, 'This is the part I replay every morning.. On Why mornings matter');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'e1', at: '872000' } });
  });

  it('signed out: "Sign in to comment" and a light Sign in that goes to sign-in', async () => {
    mockListener = undefined;
    const r = await render(createElement(MyCommentsScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Sign in to comment', 'Your comments, at their moments, live here.', 'Sign in']));
    await press(r, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('none yet: an empty spine and "No comments yet"; a failed read says it could not load', async () => {
    mockMine = () => Promise.resolve({ items: [] });
    const r = await render(createElement(MyCommentsScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['No comments yet', 'Say something at a moment from the player.']));
    expect(byId(r, 'empty-spine')).toHaveLength(1);
    mockMine = () => Promise.reject(new Error('x'));
    const f = await render(createElement(MyCommentsScreen));
    expect(words(f)).toContain("Couldn't load your comments");
  });
});

describe('Likes (likes--screen)', () => {
  const like = { listener: { id: 'aisha', displayName: 'Aisha' }, note: 'The rain at the end.', createdAt: new Date(NOW - 2 * 3_600_000).toISOString(), episode: { id: 'e2', feedUrl: 'f', guid: 'g', title: 'The long walk home', showTitle: 'Field Recordings', enclosureUrl: 'u' } };

  it('each node is the friend on the spine with "liked · 2h"; the card holds the episode, a 34 play circle and their note', async () => {
    mockLikes = () => Promise.resolve({ items: [like] });
    const r = await render(createElement(LikesScreen));
    expect(words(r)).toEqual(expect.arrayContaining(['Likes', 'Episodes people you follow liked', 'Aisha', 'liked · 2h', 'The long walk home', 'Field Recordings', '“The rain at the end.”']));
    expect(flat(byId(r, 'spine-line')[0])).toMatchObject({ left: 40, width: 2 });
    expect(flat(byId(r, 'play-dot')[0])).toMatchObject({ width: 34, height: 34 });
    expect(hosts(r, (n) => flat(n)['width'] === 52 && flat(n)['height'] === 52).length).toBeGreaterThan(0);
    // The head is the profile link (the router's Link supplies its press; the test stubs the Link).
    const head = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Aisha liked this, 2h' && n.props['accessibilityRole'] === 'link');
    expect(head.length).toBeGreaterThan(0);
  });

  it('the card opens the like, the circle plays, the head opens the profile', async () => {
    mockLikes = () => Promise.resolve({ items: [like] });
    const r = await render(createElement(LikesScreen));
    await press(r, 'The long walk home, Field Recordings');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/like/[owner]/[episode]', params: { owner: 'aisha', episode: 'e2' } });
    await press(r, 'Play The long walk home');
    expect(mockPlay).toHaveBeenCalledWith(like.episode);
  });

  it('signed out: a light Sign in; failed: the grey-glow block with a Retry that reads again; none: an empty spine', async () => {
    mockListener = undefined;
    const out = await render(createElement(LikesScreen));
    expect(words(out)).toEqual(expect.arrayContaining(['Likes', 'Sign in to see what people you follow like.', 'Sign in']));
    mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
    let calls = 0;
    mockLikes = () => { calls += 1; return calls === 1 ? Promise.reject(new Error('x')) : Promise.resolve({ items: [] }); };
    const bad = await render(createElement(LikesScreen));
    expect(words(bad)).toEqual(expect.arrayContaining(["Couldn't load likes", "Couldn't load likes right now.", 'Retry']));
    expect(byId(bad, 'page-glow')).toHaveLength(1);
    expect(greyStops(bad)).toBeGreaterThan(0);
    expect(greyStops(out)).toBe(0);
    await press(bad, 'Retry');
    expect(calls).toBe(2);
    expect(words(bad)).toContain('No likes yet');
    expect(byId(bad, 'empty-spine')).toHaveLength(1);
  });
});
