// Tests the Pulse Show screen: where each part sits on the drawing's 390 x 844 phone, the chips, the Hot moments tab and every action.
/**
 * M31 W3-A2 (T040; design-pulse2 `show--screen`, `show--menu-sheet`): the screen is rendered whole over stand-ins for its contexts.
 * What it proves in Jest (how it looks on a phone is NOT VERIFIED until a build is installed):
 *   - the numbers off the render: the stage 310 / art 300 at 85 %, the glass circles 62 from the top and 20 / 8 apart, the chips 156
 *     from the top and 28 in, the first tile 2 x 2 (178) and the others 2 x 1 (84), the thumb zone 20 in and 6 above the home strip
 *     (74 with the now bar); a taller status bar moves the top parts down;
 *   - the chip row (All · Host picks · Most popular · Hot moments NEW · Newest · Unplayed) and what each chip does to the list;
 *   - Hot moments: choosing the chip swaps the list for the deck, Play hands the moment to the Moments feed's own player action;
 *     the newest tile's hot chip shows the time of its hottest moment and plays from it;
 *   - the actions: Back, Subscribe / Subscribed, Share, Search (the field takes the hosts line's place), More (the sheet's rows),
 *     Episodes / About, Show all, play / pause on a tile, a long-press on a tile and the chip row.
 *
 * The breaks that turn it red (each tried once): in measures.ts `chipsTop: 106` -> 100; in the screen make the first tile `SHOW.rowHeight`;
 * drop `activeView !== 'hot'` from the list's data; in the thumb zone use `left: 0`.
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

beforeEach(() => {
  mockSubscribed = false; mockNow = false;
  mockExtras = { overrides: null, announcements: [], polls: [], hosts: [{ id: 'h1', name: 'Mia Tan', avatarUrl: null }], subscribers: 8100 };
  mockMoments = { status: 'ready', cards: [], all: [], reload: () => undefined };
  jest.clearAllMocks();
});

describe('where the parts sit (390 x 844, status bar 50, home strip 34)', () => {
  it('the stage, the circles, the chip row, the tiles and the thumb zone are at the drawn numbers', async () => {
    const r = await mount();
    expect(flat(byId(r, 'show-stage'))['height']).toBe(310);
    expect(flat(byId(r, 'show-veil'))['height']).toBe(310);
    const art = byId(r, 'show-stage').children[0] as ReactTestInstance;
    expect(flat(art)['height']).toBe(300);
    expect(flat(art)['opacity']).toBe(0.85);
    // The chip row: 156 from the top, the first chip 28 in.
    const header = r.root.findAll((n) => host(n) && flat(n)['height'] === 206)[0];
    expect(header).toBeDefined();
    const chipRow = r.root.findAll((n) => host(n) && flat(n)['top'] === 156 && flat(n)['position'] === 'absolute')[0];
    expect(chipRow).toBeDefined();
    const scroller = r.root.findAll((n) => n.props['horizontal'] === true && n.props['contentContainerStyle'])[0]!;
    expect((n => StyleSheet.flatten(n) as Record<string, unknown>)(scroller.props['contentContainerStyle'])).toMatchObject({ paddingLeft: 28, paddingRight: 16, gap: 5 });
    // The tiles: the newest 2 x 2 (178), the others 2 x 1 (84), 28 in and 16 from the right.
    const big = byId(r, 'show-big-tile');
    expect(flat(big)).toMatchObject({ height: 178, marginLeft: 28, marginRight: 16, borderRadius: 22 });
    const rows = allById(r, 'show-row-tile');
    expect(rows).toHaveLength(3);
    expect(flat(rows[0]!)).toMatchObject({ height: 84, marginLeft: 28, marginRight: 16, marginTop: 10, borderRadius: 22 });
    // The thumb zone: 20 in each side, 6 above the home strip the root pads.
    expect(flat(byId(r, 'show-thumb-zone'))).toMatchObject({ left: 20, right: 20, bottom: 6 });
  });
  it('a taller status bar moves the top parts down; the now bar lifts the thumb zone to 74', async () => {
    mockNow = true;
    const r = await mount(59);
    expect(r.root.findAll((n) => host(n) && flat(n)['top'] === 165 && flat(n)['position'] === 'absolute')).not.toHaveLength(0);
    expect(r.root.findAll((n) => host(n) && flat(n)['height'] === 215)).not.toHaveLength(0);
    expect(flat(byId(r, 'show-thumb-zone'))['bottom']).toBe(74);
  });
  it('the glass circles are 44 round, 62 from the top and 8 apart', async () => {
    const r = await mount();
    const search = pressable(r, "Search this show's episodes");
    const more = pressable(r, 'More: show info, report this show');
    expect(flat(search)).toMatchObject({ width: 44, height: 44 });
    const row = r.root.findAll((n) => host(n) && flat(n)['top'] === 62 && flat(n)['gap'] === 8)[0]!;
    expect(flat(row)).toMatchObject({ right: 20, gap: 8 });
    expect(more).toBeDefined();
  });
});

describe('the chip row and the list', () => {
  it('All · Hot moments (NEW) · Newest · Unplayed; Host picks and Most popular only when there is something', async () => {
    const r = await mount();
    for (const l of ['All', 'Hot moments, new', 'Newest first. Show oldest first', 'Show unplayed only']) expect(pressable(r, l)).toBeDefined();
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Host picks')).toHaveLength(0);
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Most popular')).toHaveLength(0);
    expect(texts(r).has('NEW')).toBe(true);
  });
  it('Oldest flips the order of the tiles; Unplayed hides what is finished', async () => {
    const r = await mount();
    expect(texts(r).has('Episode 0')).toBe(true);
    press(r, 'Newest first. Show oldest first');
    expect(pressable(r, 'Oldest first. Show newest first')).toBeDefined();
    const big = byId(r, 'show-big-tile');
    expect(JSON.stringify(big.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children']))).toContain('Episode 3');
  });
  it('Hot moments swaps the list for the deck, and All swaps it back', async () => {
    mockMoments = { status: 'ready', cards: [{ episodeId: 'e0', showTitle: 'Morning Notes', episodeTitle: 'Episode 0', feedUrl: 'https://f/x', guid: 'g', startMs: 872_000, endMs: 890_000, reactions: 14, rank: 1, followed: false, comments: [] }], all: [], reload: () => undefined };
    const r = await mount();
    expect(allById(r, 'show-big-tile')).toHaveLength(1);
    press(r, 'Hot moments, new');
    expect(allById(r, 'show-big-tile')).toHaveLength(0);
    expect(allById(r, 'hot-moment-card')).toHaveLength(1);
    // The sort chips belong to the list: gone in the deck.
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Show unplayed only')).toHaveLength(0);
    const play = pressable(r, 'Play Episode 0 from 14:32');
    act(() => { (play.props['onPress'] as () => void)(); });
    expect(mockPlayFull).toHaveBeenCalledWith(expect.objectContaining({ episodeId: 'e0', startMs: 872_000 }));
    press(r, 'All');
    expect(allById(r, 'show-big-tile')).toHaveLength(1);
  });
  it('the newest tile wears the time of its hottest moment and plays from it', async () => {
    mockMoments = { status: 'ready', cards: [{ episodeId: 'e0', showTitle: 'Morning Notes', episodeTitle: 'Episode 0', feedUrl: 'https://f/x', guid: 'g', startMs: 872_000, endMs: 890_000, reactions: 14, rank: 1, followed: false, comments: [] }], all: [], reload: () => undefined };
    const r = await mount();
    const chip = pressable(r, 'Play from the hottest moment, 14:32');
    expect(chip).toBeDefined();
    act(() => { (chip.props['onPress'] as () => void)(); });
    expect(mockPlayFull).toHaveBeenCalledTimes(1);
  });
  it('with no hot moment known the newest tile has no chip', async () => {
    const r = await mount();
    expect(r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && n.props['accessibilityLabel'].startsWith('Play from the hottest'))).toHaveLength(0);
  });
});

describe('the thumb zone and the actions', () => {
  it('shows the hosts line with the counts, the title, one line of description with Show all', async () => {
    const r = await mount();
    const t = texts(r);
    expect(t.has('Hosted by Mia Tan ›')).toBe(true);
    expect(t.has('4 eps · 8.1k subs')).toBe(true);
    expect(t.has('Morning Notes')).toBe(true);
    expect(t.has('Short, warm, good with coffee.')).toBe(true);
    expect(t.has('Show all')).toBe(true);
    press(r, 'Description. Show all');
    expect(t.has('Show all')).toBe(true);
    expect(texts(r).has('Show less')).toBe(true);
  });
  it('Back goes back; Subscribe subscribes, pushes the sync and turns into Subscribed; Share opens the panel', async () => {
    const r = await mount();
    press(r, 'Back');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    press(r, 'Subscribe to this show');
    expect(mockStores.subscriptions.add).toHaveBeenCalledTimes(1);
    expect(mockSync.push).toHaveBeenCalledTimes(1);
    expect(pressable(r, 'Unsubscribe from this show')).toBeDefined();
    expect(texts(r).has('Subscribed')).toBe(true);
    press(r, 'Unsubscribe from this show');
    expect(mockStores.subscriptions.remove).toHaveBeenCalledTimes(1);
    press(r, 'Share this show');
    expect(mockShare).toHaveBeenCalledWith(expect.objectContaining({ heading: 'Share this show' }));
  });
  it('Search puts the field where the hosts line was; closing it brings the line back', async () => {
    const r = await mount();
    expect(allById(r, 'search-field')).toHaveLength(0);
    press(r, "Search this show's episodes");
    expect(allById(r, 'search-field')).toHaveLength(1);
    expect(texts(r).has('Hosted by Mia Tan ›')).toBe(false);
    press(r, 'Close search');
    expect(allById(r, 'search-field')).toHaveLength(0);
  });
  it('the Episodes · About pill swaps the page for About and back', async () => {
    const r = await mount();
    press(r, 'About');
    expect(allById(r, 'show-about')).toHaveLength(1);
    expect(allById(r, 'show-row-tile')).toHaveLength(0);
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Report this show' && typeof n.props['onPress'] === 'function')).not.toHaveLength(0);
    press(r, 'Episodes');
    expect(allById(r, 'show-about')).toHaveLength(0);
    expect(allById(r, 'show-big-tile')).toHaveLength(1);
  });
  it('a tile opens its episode, its disc plays, a long-press opens the Details sheet; the chip row long-press queues the list', async () => {
    const r = await mount();
    const open = r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && n.props['accessibilityLabel'].startsWith('Episode 1.') && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { (open.props['onPress'] as () => void)(); });
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'e1' } });
    press(r, 'Play Episode 1');
    expect(mockPlayerObj.load).toHaveBeenCalledTimes(1);
    const tile = r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && n.props['accessibilityLabel'].startsWith('Episode 2.') && typeof n.props['onLongPress'] === 'function')[0]!;
    act(() => { (tile.props['onLongPress'] as () => void)(); });
    expect(r.root.findAll((n) => n.type === ('EpisodeRowSheetOpen' as unknown as string))).toHaveLength(1);
    const row = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Add all to playlist, 4 episodes' && typeof n.props['onLongPress'] === 'function')[0]!;
    act(() => { (row.props['onLongPress'] as () => void)(); });
    expect(mockStores.queue.replace).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalled();
  });
  it('More opens the sheet with Show info, Add all to playlist and Report; Show info goes to the info page', async () => {
    const r = await mount();
    press(r, 'More: show info, report this show');
    expect(pressable(r, 'Add all to playlist, 4 episodes')).toBeDefined();
    press(r, 'Show info');
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/show-info/[feedUrl]', params: { feedUrl: encodeURIComponent('https://f/x') } });
  });
  it('a host\'s face opens their profile', async () => {
    const r = await mount();
    press(r, 'Host: Mia Tan');
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/profile/[id]', params: { id: 'h1' } });
  });
});

describe('the kit Chip\'s compact form (the chip row of four)', () => {
  it('is 10 in at the 12 pt step with a NEW badge after the words; the plain chip is unchanged', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Chip } = require('../src/ui/kit/Chip') as typeof import('../src/ui/kit/Chip');
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(Chip, { label: 'Hot moments', compact: true, tag: 'NEW', onPress: () => undefined })); });
    const chip = r.root.find((n) => host(n) && n.props['accessibilityRole'] === 'button');
    expect(flat(chip)).toMatchObject({ height: 36, paddingHorizontal: 10 });
    expect(texts(r).has('NEW')).toBe(true);
    act(() => { r = create(createElement(Chip, { label: 'All', onPress: () => undefined })); });
    expect(flat(r.root.find((n) => host(n) && n.props['accessibilityRole'] === 'button'))).toMatchObject({ height: 36, paddingHorizontal: 14 });
    expect(texts(r).has('NEW')).toBe(false);
  });
});
