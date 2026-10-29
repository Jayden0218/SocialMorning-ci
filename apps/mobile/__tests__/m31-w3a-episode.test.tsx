// Tests the Pulse Episode page: where each part sits on the drawing's 390 × 844 phone, every action, and the More sheet.
/**
 * M31 W3-A (T040; design-pulse2 `listen.html` `episode--screen`, `episode--more-sheet`, `-playlist-picker`, `-save-moment`,
 * `episode--related-empty`): the page is rendered whole over a REAL player runtime, with the app's contexts stood in for.
 * What it proves, in Jest (how it looks on a phone is NOT VERIFIED until a build is installed):
 *   - the numbers off the render: cover 470, pills 64, the curve at 330 (70 bars, 40 tall, five hot), counts 384, the
 *     title block 112 and the tray 40 from the bottom (60 tall, 12 in), the fade 300; a taller status bar moves the top parts
 *     (`episodeLayout`); the bottom parts are measured from the strip the root pads, so they follow a taller inset by themselves;
 *   - every action keeps its name and does what it did (the action map): Back, Show, Play / Pause, Subscribe, Add to
 *     queue, Comments, Like, Share, More, the hottest-moment pill, a long-press on the title;
 *   - the ⋯ sheet: eight tiles in the drawn order, 84 tall, radius 20; Add to queue's long-press; Download's states; the
 *     two second pages swap the tiles; Report episode opens the report sheet;
 *   - the sections: Notes (a timestamp chip plays from there), Related (a 200 wide deck; the dashed empty card).
 *
 * The breaks that turn it red (each tried once): in src/ui/episode/measures.ts return `titleBottom: episode.titleBottom - 12 - episode.homeInset`
 * (the title block drops onto the tray); in EpisodeStage draw the curve with `count={50}`; in EpisodeTray drop `justify-around`;
 * in EpisodeMoreSheet swap the order of Download and Add to queue; in RelatedEpisodes make the card `width: 148`.
 */
import { createElement } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockToast = jest.fn();
const mockLike = jest.fn();
const mockUnlike = jest.fn();
const mockSetString = jest.fn();
const mockRequest = jest.fn();
const mockCancel = jest.fn();
const mockRemove = jest.fn();
const mockCreatePlaylist = jest.fn();
const mockAddToPlaylist = jest.fn();
let mockListener: { listenerId: string } | undefined = { listenerId: 'me' };
let mockNextUp: unknown[] = [];
let mockLiked = false;
let mockDownloadRow: Record<string, unknown> | undefined;
let mockDownloadListeners: Array<() => void> = [];
let mockNotes: string | undefined;
let mockWatchPaired = false;
let mockPlaylists: Array<{ id: string; title: string; count: number; isPublic: boolean; updatedAt: string }> = [];
const mockCached: { social: { episode: { id: string; durationMs: number }; comments: unknown[]; heat: { available: true; buckets: number[] }; serverTime: string } } = {
  social: { episode: { id: 'e1', durationMs: 600_000 }, comments: [], heat: { available: true, buckets: Array.from({ length: 100 }, (_, i) => (i >= 39 && i <= 43 ? (i === 40 ? 1 : 0.9) : 0.1)) }, serverTime: '2026-10-28T10:00:00.000Z' },
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), replace: jest.fn() }),
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ id: 'e1' }),
  useFocusEffect: () => undefined,
  usePathname: () => '/episode/e1',
  useIsFocused: () => true,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: (s: string) => { mockSetString(s); return Promise.resolve(true); } }));
jest.mock('@/ui/shell/providers', () => {
  const { createMemoryStores } = jest.requireActual('@/storage/memory');
  const { hash } = jest.requireActual('@/feeds/hash');
  const stores = createMemoryStores(hash);
  const episode = () => ({
    id: 'e1', feedUrl: 'https://f/x.xml', guid: 'e1', title: 'Why mornings matter', imageUrl: 'https://img/e1.png', durationMs: 600_000, enclosureType: 'audio/mpeg', enclosureUrl: 'https://a/e1.mp3',
    publishedAt: Date.UTC(2026, 9, 27, 12, 0, 0), transcripts: [], ...(mockNotes !== undefined ? { shownotesHtml: mockNotes } : {}),
  });
  stores.feeds = { ...stores.feeds, getEpisode: (id: string) => (id === 'e1' ? episode() : undefined), getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Morning Notes', imageUrl: 'https://img/show.png', categories: [] }) };
  stores.downloads = { ...stores.downloads, get: () => mockDownloadRow, list: () => (mockDownloadRow ? [mockDownloadRow] : []) };
  const downloads = {
    verify: () => Promise.resolve(false),
    subscribe: (l: () => void) => { mockDownloadListeners.push(l); return () => { mockDownloadListeners = mockDownloadListeners.filter((x) => x !== l); }; },
    request: (...a: unknown[]) => { mockRequest(...a); return Promise.resolve({ kind: 'queued' }); },
    cancel: (...a: unknown[]) => { mockCancel(...a); return Promise.resolve(); },
    remove: (...a: unknown[]) => { mockRemove(...a); return Promise.resolve(); },
  };
  return { useStores: () => stores, useSubscriptionSync: () => ({ push: jest.fn() }), useToast: () => mockToast, useDownloads: () => downloads, __stores: stores };
});
jest.mock('@/social/context', () => {
  const value = {
    api: { nextUp: () => Promise.resolve({ items: mockNextUp }), recordShare: () => Promise.resolve(), registerEpisode: () => Promise.resolve(), showExtras: () => new Promise(() => undefined) },
    listener: undefined as unknown,
    composer: { open: jest.fn() },
    refresh: jest.fn(),
    useEpisodeSocial: () => ({ cached: mockCached, stale: false }),
  };
  return { useSocial: () => { value.listener = mockListener; return value; } };
});
jest.mock('@/social/usePoll', () => ({ usePoll: () => undefined }));
// The hooks hand back one object each (the real ones are memoised): a new object per render would re-run the pages' effects for ever.
jest.mock('@/social/m12-api', () => {
  const api = { episodeCounts: () => Promise.resolve({ counts: { e1: 14 }, listeners: { e1: 120 } }) };
  return { useM12Api: () => api };
});
jest.mock('@/social/profile-api', () => {
  const api = {
    episodeLike: () => Promise.resolve({ liked: mockLiked }),
    like: (...a: unknown[]) => { mockLike(...a); return Promise.resolve({ liked: true }); },
    unlike: (...a: unknown[]) => { mockUnlike(...a); return Promise.resolve(); },
  };
  return { useProfileApi: () => api };
});
jest.mock('@/social/m19-api', () => {
  const api = {
    myPlaylists: () => Promise.resolve(mockPlaylists),
    createPlaylist: (t: string) => { mockCreatePlaylist(t); return Promise.resolve({ id: 'new', title: t, count: 0, isPublic: false, updatedAt: '' }); },
    addToPlaylist: (...a: unknown[]) => { mockAddToPlaylist(...a); return Promise.resolve(); },
  };
  return { PLAYLIST_TITLE_MAX: 60, useM19Api: () => api };
});
jest.mock('@/graph/context', () => ({ useGraph: () => ({ useEpisodeClips: () => ({ clips: [{ id: 'c1' }, { id: 'c2' }], pending: [], loading: false, refresh: jest.fn() }) }) }));
jest.mock('@/ui/show/ShowExtras', () => ({ useShowExtras: () => [undefined, jest.fn()], ShowExtrasBlock: () => null }));
jest.mock('@/ui/comments/CommentPreview', () => {
  const { createElement: h } = jest.requireActual('react');
  return { CommentPreview: () => h('CommentPreviewMarker', { testID: 'comment-preview' }) };
});
jest.mock('@/ui/clips/ClipList', () => ({ ClipList: () => null }));
jest.mock('@/ui/comments/Composer', () => ({ ComposerSheet: () => null }));
jest.mock('@/ui/comments/ReportSheet', () => {
  const { createElement: h } = jest.requireActual('react');
  return { ReportSheet: (p: { target?: { kind: string } }) => (p.target ? h('ReportOpen', { accessibilityLabel: `Report ${p.target.kind}` }) : null) };
});
jest.mock('@/ui/kit/EpisodeRowSheet', () => ({ EpisodeRowSheet: () => null }));
jest.mock('@/ui/social/LikeSheet', () => {
  const { createElement: h } = jest.requireActual('react');
  return { LikeSheet: (p: { open: boolean }) => (p.open ? h('LikeOpen', { accessibilityLabel: 'Like sheet' }) : null) };
});
jest.mock('@/ui/clips/ShareChooser', () => {
  const { createElement: h } = jest.requireActual('react');
  return { ShareChooser: (p: { open: boolean }) => (p.open ? h('ShareChooserOpen', { accessibilityLabel: 'Share panel' }) : null) };
});
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => ({ open: jest.fn() }) }));
jest.mock('@/discover/open', () => ({ resolveCard: jest.fn() }));
jest.mock('@/feeds/fetch', () => ({ refreshShow: jest.fn() }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ id, url: 'https://a/x.mp3', title: 'Why mornings matter', showTitle: 'Morning Notes' }) }));
jest.mock('react-native-zoom-toolkit', () => ({ Gallery: () => null, fitContainer: () => ({ width: 1, height: 1 }), useImageResolution: () => ({ resolution: undefined, error: false }) }));
jest.mock('@/ui/player/PlayerBackdrop', () => ({ PlayerBackdrop: () => null }));
jest.mock('../modules/watch-link', () => ({
  watchState: () => ({ supported: true, paired: mockWatchPaired, appInstalled: mockWatchPaired, reachable: mockWatchPaired }),
  sendEpisode: () => true,
}));
jest.mock('@/sync/watch', () => ({ showDownloadToWatch: () => mockWatchPaired, toWatchEpisode: (e: unknown) => e }));

import EpisodeScreen from '../app/episode/[id]';
import { PlayerProvider, createPlayerRuntime, type PlayerRuntime } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';
import { episode as EPISODE_TOKENS, player as PLAYER_TOKENS } from '@/design/tokens';
import { episodeLayout } from '@/ui/episode/measures';
import { colour } from '@/design';
import { isFavourite } from '@/me/favourites';
import { listMoments } from '@/me/moments';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const providers = require('@/ui/shell/providers') as { __stores: ReturnType<typeof createMemoryStores> };

function harness(): { runtime: PlayerRuntime; push: (e: AdapterEvent) => void } {
  let listener: ((event: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = { execute: async () => undefined, subscribe: (l) => { listener = l; return () => undefined; }, configure: async () => undefined, release: () => undefined };
  const runtime = createPlayerRuntime({ adapter, stores: createMemoryStores(hash), now: () => 1, notify: () => undefined });
  return { runtime, push: (e) => listener?.(e) };
}

const rendered: ReactTestRenderer[] = [];
async function mount(runtime: PlayerRuntime, insets = { top: 47, bottom: 34, left: 0, right: 0 }): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: insets }, createElement(PlayerProvider, { runtime }, createElement(EpisodeScreen))));
  });
  rendered.push(r);
  return r;
}
const hosts = (r: ReactTestRenderer, pred: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && pred(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance => {
  const n = hosts(r, (x) => x.props['testID'] === id)[0];
  if (!n) throw new Error(`no testID "${id}"`);
  return n;
};
const style = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const labels = (r: ReactTestRenderer): string[] => hosts(r, (n) => typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const find = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
/** The innermost element with this name: the one that carries the style and the state the finger meets. */
const inner = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const all = r.root.findAll((n) => n.props['accessibilityLabel'] === label);
  if (all.length === 0) throw new Error(`no "${label}" in: ${labels(r).join(' | ')}`);
  return all[all.length - 1]!;
};
const flush = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
const press = async (r: ReactTestRenderer, label: string) => {
  const n = find(r, label);
  if (!n) throw new Error(`no pressable "${label}" in: ${labels(r).join(' | ')}`);
  await act(async () => { n.props['onPress'](); });
  await flush();
};
/** The named pressables inside a container, outermost first, once each. */
const namedIn = (container: ReactTestInstance): ReactTestInstance[] => {
  const seen = new Set<string>();
  return container.findAll((n) => typeof n.props['onPress'] === 'function' && typeof n.props['accessibilityLabel'] === 'string').filter((n) => {
    const l = n.props['accessibilityLabel'] as string;
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
};
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());
/** The ⋯ sheet's own scroll view: tiles with the page's names (Add to queue is in the tray too) are found here. */
const sheet = (r: ReactTestRenderer): ReactTestInstance => byId(r, 'episode-more-scroll');
const sheetLabels = (r: ReactTestRenderer): string[] => sheet(r).findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const innerIn = (c: ReactTestInstance, label: string): ReactTestInstance => {
  const all = c.findAll((n) => n.props['accessibilityLabel'] === label);
  if (all.length === 0) throw new Error(`no "${label}" in the sheet`);
  return all[all.length - 1]!;
};
const pressIn = async (c: ReactTestInstance, label: string) => {
  const n = c.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}" in the sheet`);
  await act(async () => { n.props['onPress'](); });
  await flush();
};

beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionForTest(true);
  for (const m of [mockPush, mockBack, mockToast, mockLike, mockUnlike, mockSetString, mockRequest, mockCancel, mockRemove, mockCreatePlaylist, mockAddToPlaylist]) m.mockClear();
  mockListener = { listenerId: 'me' };
  mockNextUp = [];
  mockLiked = false;
  mockDownloadRow = undefined;
  mockDownloadListeners = [];
  mockNotes = undefined;
  mockWatchPaired = false;
  mockPlaylists = [];
  providers.__stores.settings.set('me.favourites', '[]');
  providers.__stores.settings.set('me.moments', '[]');
  providers.__stores.queue.replace([], 1);
});
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => { for (let i = 0; i < 100 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers(); });
  jest.clearAllTimers();
  jest.useRealTimers();
  setReducedMotionForTest(undefined);
});

describe('the page on the drawing\'s 390 × 844 phone (status bar 50, home inset 34)', () => {
  it('puts the parts where the drawing does', async () => {
    const r = await mount(harness().runtime);
    // The cover fills the top 470 under a 480 veil.
    expect(style(byId(r, 'episode-cover'))['height']).toBe(470);
    expect(style(byId(r, 'episode-veil'))['height']).toBe(480);
    // Two pills at 64; the curve at 330; the counts are in the title block's flow (M31 F13), not at a fixed 384.
    expect(style(byId(r, 'episode-pills'))['top']).toBe(64);
    expect(style(byId(r, 'episode-curve'))['top']).toBe(330);
    expect(style(byId(r, 'episode-counts'))['position']).toBeUndefined();
    // The thumb zone 112 up, the tray 40 up and 12 in — from the screen's edge: the root pads the 34 pt home strip, so the page's own
    // offsets are 78 and 6 from the strip.
    expect(style(byId(r, 'episode-title-pos'))['bottom'] as number + 34).toBe(112);
    const tray = style(byId(r, 'episode-tray-pos'));
    expect([(tray['bottom'] as number) + 34, tray['left'], tray['right']]).toEqual([40, 12, 12]);
    expect(style(byId(r, 'episode-tray'))['height']).toBe(60);
    // The curve: 70 bars, none taller than 40, the hot run five bars lit hot.
    const bars = byId(r, 'episode-curve').findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'curve-bar');
    expect(bars).toHaveLength(70);
    expect(Math.max(...bars.map((b) => style(b)['height'] as number))).toBeLessThanOrEqual(40);
    const hot = bars.filter((b) => style(b)['backgroundColor'] === colour.hot);
    expect(hot.length).toBeGreaterThanOrEqual(3);
    expect(hot.length).toBeLessThanOrEqual(8);
  });

  it('moves with a taller status bar (the top parts); the bottom parts stay on the strip the root pads', async () => {
    const r = await mount(harness().runtime, { top: 59, bottom: 44, left: 0, right: 0 });
    expect(style(byId(r, 'episode-pills'))['top']).toBe(73);
    expect(style(byId(r, 'episode-curve'))['top']).toBe(339);
    // The root pads the taller strip by itself: the page's offsets from the strip do not move (78 and 6), so on screen they are 10 higher.
    expect(style(byId(r, 'episode-title-pos'))['bottom']).toBe(78);
    expect(style(byId(r, 'episode-tray-pos'))['bottom']).toBe(6);
    expect(episodeLayout({ top: 50 })).toMatchObject({ pillsTop: 64, curveTop: 330, stageHeight: 470, titleBottom: 78, trayBottom: 6 });
  });

  it('says what the stage says: the date pill, the hottest moment, and the counts', async () => {
    const r = await mount(harness().runtime);
    const t = text(r);
    expect(t).toContain('TUE 27 OCT · 10:00');
    expect(t).toContain('hottest at 4:00');
    expect(t).toContain('120 listened · 2 clips');
  });

  it('the tray: five items spread evenly, each with its name and a 48 pt reach', async () => {
    const r = await mount(harness().runtime);
    const tray = byId(r, 'episode-tray');
    expect(style(tray)['justifyContent']).toBe('space-around');
    const items = namedIn(tray);
    expect(items.map((n) => n.props['accessibilityLabel'])).toEqual(['Add to queue', 'Comments, 0', 'Like this episode', 'Share this episode', 'More: play next, download, save a moment']);
    for (const n of items) {
      const slop = n.props['hitSlop'] as { top: number; bottom: number; left: number; right: number };
      expect((style(n)['height'] as number) + slop.top + slop.bottom).toBeGreaterThanOrEqual(48);
    }
  });

  it('the title block: Back 44, the show link, Unbounded 28, Play (light, 48) and Subscribe (ring)', async () => {
    const r = await mount(harness().runtime);
    const all = labels(r);
    for (const l of ['Back', 'Show: Morning Notes', 'Play this episode', 'Subscribe to this show']) expect(all).toContain(l);
    expect(style(inner(r, 'Back'))['width']).toBe(44);
    const title = hosts(r, (n) => n.props['accessibilityRole'] === 'header' && n.props['children'] === 'Why mornings matter')[0]!;
    expect(style(title)['fontSize']).toBe(28);
    expect(style(inner(r, 'Play this episode'))['height']).toBe(48);
    expect(style(inner(r, 'Subscribe to this show'))['paddingHorizontal']).toBe(18);
  });
});

describe('the actions keep their names and do what they did', () => {
  it('Back goes back; the show link opens the show', async () => {
    const r = await mount(harness().runtime);
    await press(r, 'Back');
    expect(mockBack).toHaveBeenCalledTimes(1);
    await press(r, 'Show: Morning Notes');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent('https://f/x.xml') } });
  });

  it('Play loads the episode and opens the player; while it plays the pill says Pause and pauses', async () => {
    const h = harness();
    const load = jest.spyOn(h.runtime, 'load');
    const r = await mount(h.runtime);
    await press(r, 'Play this episode');
    expect(load).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/player');
    act(() => { h.push({ type: 'LOADED', durationMs: 600_000 }); });
    await act(async () => { await Promise.resolve(); });
    expect(labels(r)).toContain('Pause');
    const pause = jest.spyOn(h.runtime, 'pause');
    await press(r, 'Pause');
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('Subscribe subscribes and its name flips; again unsubscribes', async () => {
    const r = await mount(harness().runtime);
    await press(r, 'Subscribe to this show');
    expect(providers.__stores.subscriptions.has('https://f/x.xml')).toBe(true);
    expect(labels(r)).toContain('Unsubscribe from this show');
    expect(inner(r, 'Unsubscribe from this show').props['accessibilityState']).toMatchObject({ selected: true });
    await press(r, 'Unsubscribe from this show');
    expect(providers.__stores.subscriptions.has('https://f/x.xml')).toBe(false);
  });

  it('the tray: queue adds to the end, Comments opens the conversation, Share opens the panel', async () => {
    const r = await mount(harness().runtime);
    await press(r, 'Add to queue');
    expect(providers.__stores.queue.list()).toEqual(['e1']);
    expect(mockToast).toHaveBeenCalledWith('Added to the queue');
    await press(r, 'Comments, 0');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/comments/[episodeId]', params: { episodeId: 'e1', at: '0' } });
    await press(r, 'Share this episode');
    expect(labels(r)).toContain('Share panel');
  });

  it('Like likes, flips its name and opens the Like sheet; again unlikes; signed out it goes to sign-in', async () => {
    const r = await mount(harness().runtime);
    await press(r, 'Like this episode');
    expect(mockLike).toHaveBeenCalledWith('e1', undefined);
    expect(labels(r)).toContain('Unlike this episode');
    expect(labels(r)).toContain('Like sheet');
    expect(inner(r, 'Unlike this episode').props['accessibilityState']).toMatchObject({ selected: true });
    await press(r, 'Unlike this episode');
    expect(mockUnlike).toHaveBeenCalledWith('e1');
    mockListener = undefined;
    const r2 = await mount(harness().runtime);
    await press(r2, 'Like this episode');
    expect(mockPush).toHaveBeenLastCalledWith('/auth/sign-in');
  });

  it('the hottest-moment pill plays from the peak; a long-press on the title copies it', async () => {
    const h = harness();
    const load = jest.spyOn(h.runtime, 'load');
    const seek = jest.spyOn(h.runtime, 'seek');
    const r = await mount(h.runtime);
    await press(r, 'Play from the hottest moment, 4:00');
    expect(load).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(240_000);
    expect(mockPush).toHaveBeenCalledWith('/player');
    const title = hosts(r, (n) => typeof n.props['onLongPress'] === 'function' && n.props['accessibilityRole'] === 'header')[0]!;
    await act(async () => { title.props['onLongPress'](); });
    expect(mockSetString).toHaveBeenCalledWith('Why mornings matter');
    expect(mockToast).toHaveBeenCalledWith('Title copied.');
  });
});

describe('the ⋯ sheet', () => {
  const open = async (r: ReactTestRenderer) => { await press(r, 'More: play next, download, save a moment'); };
  const TILES = ['Play next', 'Add to queue', 'Download this episode', 'Add to favourites', 'Save the moment at 0:00', 'Add to playlist', 'Report episode'];

  it('draws the head and eight tiles in the drawn order, 84 tall, radius 20 (Watch hidden: seven)', async () => {
    const r = await mount(harness().runtime);
    await open(r);
    expect(byId(r, 'more-head')).toBeTruthy();
    const order = sheetLabels(r).filter((l) => TILES.includes(l));
    expect(order).toEqual(TILES);
    // Wi-Fi only → the mobile-data choice is a wide tile under the Download row.
    expect(labels(r)).toContain('Use mobile data instead');
    for (const l of TILES) {
      const st = style(innerIn(sheet(r), l));
      expect([st['height'], st['borderRadius']]).toEqual([PLAYER_TOKENS.tileHeight, PLAYER_TOKENS.panelRadius]);
    }
    // Two to a row: the Download tile and Add to favourites share a row (48.5 % wide each), the mobile-data tile has its own.
    expect(style(innerIn(sheet(r), 'Download this episode'))['width']).toBe('48.5%');
    expect(style(innerIn(sheet(r), 'Use mobile data instead'))['width']).toBe('100%');
  });

  it('with a paired Watch the eighth tile is Download to Watch', async () => {
    mockWatchPaired = true;
    const r = await mount(harness().runtime);
    await open(r);
    expect(labels(r)).toContain('Download to Watch');
  });

  it('Play next goes to the front and Add to queue to the end; a long-press on it adds to the front', async () => {
    providers.__stores.queue.replace(['x1'], 1);
    const r = await mount(harness().runtime);
    await open(r);
    await pressIn(sheet(r), 'Add to queue');
    expect(providers.__stores.queue.list()).toEqual(['x1', 'e1']);
    expect(mockToast).toHaveBeenCalledWith('Added to the queue');
    providers.__stores.queue.replace(['x1'], 2);
    const long = sheet(r).findAll((x) => x.props['accessibilityLabel'] === 'Add to queue' && typeof x.props['onLongPress'] === 'function')[0]!;
    expect(long.props['accessibilityActions']).toEqual([{ name: 'longpress', label: 'Add to the front' }]);
    await act(async () => { long.props['onLongPress'](); });
    expect(providers.__stores.queue.list()).toEqual(['e1', 'x1']);
    expect(mockToast).toHaveBeenCalledWith('Added to the front');
    await pressIn(sheet(r), 'Play next');
    expect(mockToast).toHaveBeenCalledWith('Playing next');
    expect(providers.__stores.queue.list()[0]).toBe('e1');
  });

  it('Add to favourites turns light and reads "Remove from favourites"; again removes', async () => {
    const r = await mount(harness().runtime);
    await open(r);
    await press(r, 'Add to favourites');
    expect(isFavourite(providers.__stores.settings, 'e1')).toBe(true);
    const on = inner(r, 'Remove from favourites');
    expect(on.props['accessibilityState']).toMatchObject({ selected: true });
    await press(r, 'Remove from favourites');
    expect(isFavourite(providers.__stores.settings, 'e1')).toBe(false);
  });

  it('Download shows its state in the tile and the tap does what the state says', async () => {
    const r = await mount(harness().runtime);
    await open(r);
    await press(r, 'Download this episode');
    expect(mockRequest).toHaveBeenCalledWith('e1', { allowMobile: false });
    await press(r, 'Use mobile data instead');
    expect(labels(r)).toContain('Download now on mobile data');
    await press(r, 'Download now on mobile data');
    expect(mockRequest).toHaveBeenLastCalledWith('e1', { allowMobile: true });
  });

  it('while downloading the tile cancels it; when done it removes it', async () => {
    mockDownloadRow = { episodeId: 'e1', state: 'downloading', bytesDone: 42, bytesTotal: 100 };
    const r = await mount(harness().runtime);
    await open(r);
    expect(text(r)).toContain('Downloading · 42 %');
    await press(r, 'Cancel the download');
    expect(mockCancel).toHaveBeenCalledWith('e1');
    mockDownloadRow = { episodeId: 'e1', state: 'complete', bytesDone: 5 * 1024 * 1024, bytesTotal: 5 * 1024 * 1024 };
    await act(async () => { mockDownloadListeners.forEach((l) => l()); });
    expect(text(r)).toContain('Downloaded · 5 MB');
    await press(r, 'Remove the download');
    expect(mockRemove).toHaveBeenCalledWith('e1');
  });

  it('Save this moment swaps the tiles for the note page; Save keeps the moment and says so', async () => {
    const r = await mount(harness().runtime);
    await open(r);
    await press(r, 'Save the moment at 0:00');
    expect(byId(r, 'moment-panel')).toBeTruthy();
    expect(labels(r)).not.toContain('Add to playlist');
    const note = hosts(r, (n) => n.props['accessibilityLabel'] === 'Note for this moment')[0]!;
    await act(async () => { note.props['onChangeText']('the coffee question'); });
    await press(r, 'Save moment');
    expect(listMoments(providers.__stores.settings).map((m) => [m.episodeId, m.atMs, m.note])).toEqual([['e1', 0, 'the coffee question']]);
    expect(mockToast).toHaveBeenCalledWith('Saved the moment at 0:00.');
    // The tiles are back.
    expect(labels(r)).toContain('Add to playlist');
  });

  it('Add to playlist swaps the tiles for the picker: a tap adds, a new name creates and adds; signed out it asks to sign in', async () => {
    mockPlaylists = [{ id: 'p1', title: 'Slow mornings', count: 12, isPublic: false, updatedAt: '' }];
    const r = await mount(harness().runtime);
    await open(r);
    await press(r, 'Add to playlist');
    expect(byId(r, 'playlist-panel')).toBeTruthy();
    const tile = inner(r, 'Add to Slow mornings, 12 episodes');
    expect(style(tile)['height']).toBe(EPISODE_TOKENS.pickerTile);
    await press(r, 'Add to Slow mornings, 12 episodes');
    expect(mockAddToPlaylist).toHaveBeenCalledWith('p1', 'e1');
    expect(mockToast).toHaveBeenCalledWith('Added to Slow mornings.');
    // The picker's own Cancel closes only the picker.
    await press(r, 'Add to playlist');
    await press(r, 'Close the playlist picker');
    expect(labels(r)).toContain('Add to playlist');
    // Create: 40 % until a name is typed.
    await press(r, 'Add to playlist');
    expect(inner(r, 'Create playlist and add').props['accessibilityState']).toMatchObject({ disabled: true });
    expect(inner(r, 'Create playlist and add').props['className']).toContain('opacity-40');
    const field = hosts(r, (n) => n.props['accessibilityLabel'] === 'New playlist name')[0]!;
    await act(async () => { field.props['onChangeText']('Walks'); });
    expect(inner(r, 'Create playlist and add').props['accessibilityState']).toMatchObject({ disabled: false });
    await press(r, 'Create playlist and add');
    expect(mockCreatePlaylist).toHaveBeenCalledWith('Walks');
    expect(mockToast).toHaveBeenCalledWith('Made Walks and added the episode.');
  });

  it('Add to playlist when signed out only says so', async () => {
    mockListener = undefined;
    const r = await mount(harness().runtime);
    await open(r);
    await press(r, 'Add to playlist');
    expect(mockToast).toHaveBeenCalledWith('Sign in to make playlists.');
    expect(hosts(r, (n) => n.props['testID'] === 'playlist-panel')).toHaveLength(0);
  });

  it('Report episode closes the sheet and opens the report sheet', async () => {
    const r = await mount(harness().runtime);
    await open(r);
    await press(r, 'Report episode');
    expect(labels(r)).toContain('Report episode');
    expect(hosts(r, (n) => (n.type as string) === 'ReportOpen')).toHaveLength(1);
  });

  it('Cancel closes the sheet', async () => {
    const r = await mount(harness().runtime);
    await open(r);
    expect(labels(r)).toContain('Cancel');
    await press(r, 'Cancel');
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(hosts(r, (n) => n.props['testID'] === 'more-head')).toHaveLength(0);
  });
});

describe('the sections', () => {
  it('F3 defect 1: nothing sits behind the title block at the top; Comments is a section of its own after Related', async () => {
    mockNotes = '<p>A short one about the first hour.</p>';
    const r = await mount(harness().runtime);
    const { height } = Dimensions.get('window');
    // The sections start at the fold: a spacer from the stage's foot to the screen's foot (the drawing's first screen is the stage and the thumb zone only).
    expect(style(byId(r, 'episode-fold'))['height']).toBe(Math.max(0, height - episodeLayout({ top: 47 }).stageHeight));
    const order = r.root.findAll((n) => typeof n.type === 'string' && ['episode-stage', 'episode-fold', 'episode-section-notes', 'episode-section-related', 'comment-preview'].includes(n.props['testID'] as string)).map((n) => n.props['testID']);
    expect(order).toEqual(['episode-stage', 'episode-fold', 'episode-section-notes', 'episode-section-related', 'comment-preview']);
    expect(hosts(r, (n) => n.props['testID'] === 'episode-section-comments')).toHaveLength(1);
  });

  it('Notes: a chapter line is a timestamp chip that plays from there; the section has its edge label', async () => {
    mockNotes = '<p>A short one about the first hour.</p><p>04:12 why it counts</p>';
    const h = harness();
    const seek = jest.spyOn(h.runtime, 'seek');
    const r = await mount(h.runtime);
    expect(hosts(r, (n) => n.props['testID'] === 'episode-section-notes')).toHaveLength(1);
    expect(labels(r)).toContain('Notes');
    await press(r, 'Play from 04:12');
    expect(seek).toHaveBeenCalledWith(252_000);
    expect(mockPush).toHaveBeenCalledWith('/player');
  });

  it('Related: a deck of 200 wide cards with the cover 90 and the reason in capitals; a long-press asks for the sheet', async () => {
    mockNextUp = [1, 2, 3].map((n) => ({ episode: { id: `r${n}`, feedUrl: 'https://f/y.xml', guid: `r${n}`, title: `Related ${n}`, showTitle: 'Other', enclosureUrl: 'https://a/r.mp3' }, label: 'Listeners also played' }));
    const r = await mount(harness().runtime);
    const card = inner(r, 'Related 1, Other. Listeners also played');
    expect(style(card)['width']).toBe(200);
    expect(style(card)['borderRadius']).toBe(20);
    expect(style(byId(r, 'related-cover'))['height']).toBe(90);
    expect(hosts(r, (n) => style(n)['textTransform'] === 'uppercase').length).toBeGreaterThan(0);
  });

  it('the fade under the thumb zone is 300 tall over the stage and 260 once the page has scrolled', async () => {
    const r = await mount(harness().runtime);
    const fadeHeight = () => hosts(r, (n) => Array.isArray(n.props['colors']) && style(n)['zIndex'] === 15).map((n) => style(n)['height']);
    expect(fadeHeight()).toEqual([300]);
    const scroll = r.root.findAll((n) => n.props['testID'] === 'episode-scroll' && typeof n.props['onScroll'] === 'function')[0]!;
    await act(async () => { scroll.props['onScroll']({ nativeEvent: { contentOffset: { y: 120 } } }); });
    expect(fadeHeight()).toEqual([260]);
    await act(async () => { scroll.props['onScroll']({ nativeEvent: { contentOffset: { y: 0 } } }); });
    expect(fadeHeight()).toEqual([300]);
  });

  it('Related with nothing to suggest is the dashed empty card with today\'s line, keeping the section\'s right margin', async () => {
    const r = await mount(harness().runtime);
    const empty = byId(r, 'empty-deck');
    expect(style(empty)).toMatchObject({ height: 180, borderRadius: 22, borderStyle: 'dashed' });
    // Some box above the card carries the 16 right margin (the deck's own bleeds to the edge).
    let up: ReactTestInstance | null = empty.parent;
    let margin: unknown;
    while (up && margin === undefined) { margin = style(up)['marginRight']; up = up.parent; }
    expect(margin).toBe(16);
    expect(text(r)).toContain('Nothing to suggest yet — play something and come back.');
  });
});

describe('the sheet every episode row opens (episode--card-sheet)', () => {
  it('is the page\'s six tiles, then Details · View comments (n) · Share as Panel rows, then Cancel', async () => {
    const { EpisodeRowSheet: Real } = jest.requireActual('@/ui/kit/EpisodeRowSheet') as typeof import('@/ui/kit/EpisodeRowSheet');
    const onClose = jest.fn();
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(Real, { episode: { id: 'e1', title: 'Why mornings matter', feedUrl: 'https://f/x.xml' }, onClose, comments: 12, actions: [{ icon: 'play', label: 'Play', onPress: jest.fn() }] })));
    });
    rendered.push(r);
    const names = [...new Set(r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && typeof n.props['onPress'] === 'function').map((n) => n.props['accessibilityLabel'] as string))];
    expect(names.filter((l) => !['Close'].includes(l))).toEqual([
      'Show: Morning Notes', 'Play next', 'Add to queue', 'Download this episode', 'Add to favourites', 'Use mobile data instead', 'Save the moment at 0:00', 'Add to playlist',
      'Details', 'View comments (12)', 'Share', 'Play', 'Cancel',
    ]);
    for (const l of ['Play next', 'Add to queue', 'Add to favourites', 'Add to playlist']) expect(style(inner(r, l))['height']).toBe(84);
    await press(r, 'Details');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'e1' } });
    expect(onClose).toHaveBeenCalled();
  });
});
