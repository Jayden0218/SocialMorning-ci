// Tests that the clip page, the New clip page and their parts match the drawings in the numbers the owner compared.
/**
 * M31 W3-B (T041; "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2/listen.html `clip--screen`, `-signed-out`, `-share-sheet`, `-not-found`, `clip-new--screen`, `-signed-out`,
 * `-episode-missing`, `-saved-share-panel`, `toast--clip-new`. Each test names the revert that turns it red (each was seen red once, then restored):
 *  - the ring is 200 with an 8 stroke and a 110 light disc (glyph 40): `CLIP_RING` in src/ui/clips/measures.ts — red;
 *  - the arc follows the clip, not the episode: `clipFraction` — red;
 *  - the clip runs hot on the 60-bar curve: `hotRangeOf` — red;
 *  - the clip page plays the clip at once, "Play the episode" starts at the clip's start, the ring pauses it, ··· holds Share as video /
 *    Delete (yours) / Report (others'), signed out shows the strip with a Sign in link, a removed clip says so, a missing one is the grey page — red if
 *    any branch is swapped;
 *  - the composer: the range arc is the clip's share of the ring (`rangeShares`), a touch grabs the nearer end within 8 % (`edgeNear`), the chips are
 *    36 tall and nudge ±5 s, Start here / End here follow the playhead, Save is dropped for a range that cannot be a clip — red if swapped.
 * NOT VERIFIED: dragging the arc with a finger, the share panel's look (lane W3-D), anything on a phone.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { colour } from '@/design';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockPlayClip = jest.fn();
const mockLoad = jest.fn();
const mockSeek = jest.fn();
const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockDelete = jest.fn((_id: string) => Promise.resolve());
const mockShare = jest.fn();
const mockVideo = jest.fn();
let mockState: Record<string, unknown> = { kind: 'idle' };
let mockClipPlaying: { episodeId: string; startMs: number; endMs: number } | undefined;
let mockListener: { listenerId: string; displayName: string } | undefined = { listenerId: 'me', displayName: 'Ana' };
let mockClip: Record<string, unknown> = {};
let mockGetClipError: Error | undefined;
let mockReport: unknown;
const mockEpisode = { id: 'e1', url: 'https://cdn/e1.mp3', title: 'Why mornings matter', showTitle: 'Morning Notes', artworkUrl: 'https://img/e1.png', durationMs: 2_880_000, feedUrl: 'https://f/x.xml' };
const mockPlayer = {
  getState: () => mockState, clip: () => mockClipPlaying, playClip: (...a: unknown[]) => mockPlayClip(...a), load: (...a: unknown[]) => mockLoad(...a),
  seek: (...a: unknown[]) => mockSeek(...a), play: () => mockPlay(), pause: () => mockPause(),
};
const mockApi = {
  getClip: () => (mockGetClipError ? Promise.reject(mockGetClipError) : Promise.resolve({ clip: mockClip, episode: { id: 'e1' } })),
  deleteClip: (id: string) => mockDelete(id),
  showExtras: () => Promise.resolve(undefined),
  social: () => Promise.resolve({ status: 200, body: { heat: { available: true, buckets: Array.from({ length: 100 }, (_, i) => (i % 10) / 10) }, episode: { durationMs: 2_880_000 }, comments: [], myReactionBuckets: [] } }),
};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/clip/c1',
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/design/tailwind', () => ({ ...jest.requireActual('@/design/tailwind'), Link: ({ children }: { children: unknown }) => children }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi, listener: mockListener }) }));
// One object per run, as the real providers give (the page's effect depends on it).
const mockStores = { settings: { get: () => undefined } };
const mockToast = jest.fn();
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
let mockParams: Record<string, string> = { id: 'c1', episodeId: 'e1', positionMs: '752000' };
const mockCreate = jest.fn();
jest.mock('@/graph/context', () => ({ useGraph: () => ({ clips: { create: (...a: unknown[]) => mockCreate(...a) } }) }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => (id === 'e1' ? mockEpisode : undefined) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/feeds/fetch', () => ({ refreshShow: () => Promise.resolve() }));
jest.mock('@/graph/resolve', () => ({ resolveClipEpisode: () => Promise.resolve({ episode: mockEpisode, via: 'cache' }) }));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => mockPlayer,
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel(mockState),
}));
jest.mock('@/ui/clips/ShareChooser', () => ({
  useSharePanel: () => [(...a: unknown[]) => mockShare(...a), null],
  useClipShare: () => (clip: unknown, episode: unknown, heading = 'Share this clip') => ({ heading, rows: [{ icon: 'videocam-outline', label: 'Share as video', detail: 'up to 60 s', onPress: () => mockVideo() }], more: { run: () => undefined } }),
  useClipVideoRows: () => () => [{ icon: 'videocam-outline', label: 'Share as video', detail: 'up to 60 s', onPress: () => mockVideo() }],
}));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: (p: { target: unknown }) => { mockReport = p.target; return null; } }));
jest.mock('@/graph/share', () => ({ shareClip: jest.fn() }));
jest.mock('@/social/base-url', () => ({ apiBaseUrl: () => 'https://api' }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import ClipScreen, { hotRangeOf } from '../app/clip/[id]';
import NewClipScreen from '../app/clip/new';
import { ClipRing, clipFraction } from '@/ui/clips/ClipRing';
import { CLIP_PAGE, CLIP_RING, COMPOSER } from '@/ui/clips/measures';
import { ClipComposer, edgeNear, rangeShares } from '@/ui/clips/ClipComposer';

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => r.unmount());
  for (const f of [mockPush, mockBack, mockPlayClip, mockLoad, mockSeek, mockPlay, mockPause, mockDelete, mockShare, mockVideo]) f.mockClear();
  mockState = { kind: 'idle' }; mockClipPlaying = undefined; mockListener = { listenerId: 'me', displayName: 'Ana' }; mockGetClipError = undefined; mockReport = undefined; mockParams = { id: 'c1', episodeId: 'e1', positionMs: '752000' }; mockToast.mockClear(); mockCreate.mockReset();
});
const mount = async (el: React.ReactElement): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); });
  await act(async () => { await Promise.resolve(); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const press = async (r: ReactTestRenderer, label: string) => { const n = byLabel(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); await act(async () => { n.props['onPress'](); }); };
const hostOf = (n: ReactTestInstance) => n.findAll((x) => typeof x.type === 'string')[0]!;
const texts = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const classes = (n: ReactTestInstance) => [n, ...n.findAll((x) => typeof x.props['className'] === 'string')].map((x) => String(x.props['className'] ?? '')).join(' ');
const clip = (over: Record<string, unknown> = {}) => ({ id: 'c1', author: { id: 'rui', displayName: 'Rui' }, episodeId: 'e1', startMs: 722_000, endMs: 752_000, caption: 'the part I replay every morning', createdAt: 'x', deleted: false, ...over });

describe('the ring and the maths', () => {
  it('the ring is 200 with an 8 stroke, the disc 110 with a 40 glyph', () => {
    expect(CLIP_RING).toMatchObject({ size: 200, stroke: 8, disc: 110, glyph: 40 });
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(ClipRing, { startMs: 0, endMs: 30_000, live: false, playing: false, label: 'Play the clip, 0:00 to 0:30', onPress: jest.fn() })); });
    rendered.push(r);
    const box = r.root.findAll((n) => n.props['testID'] === 'clip-ring' && typeof n.type === 'string')[0]!;
    expect(flat(box)['width']).toBe(200);
    const disc = hostOf(byLabel(r, 'Play the clip, 0:00 to 0:30')[0]!);
    expect(flat(disc)['width']).toBe(110);
    expect(r.root.findAll((n) => n.props['strokeWidth'] === 8).length).toBeGreaterThan(0);
  });
  it('the arc is the clip\'s own progress: nothing before it, full at its end', () => {
    expect(clipFraction(700_000, 722_000, 752_000)).toBe(0);
    expect(clipFraction(737_000, 722_000, 752_000)).toBeCloseTo(0.5);
    expect(clipFraction(900_000, 722_000, 752_000)).toBe(1);
    expect(clipFraction(5, 10, 10)).toBe(0);
  });
  it('the clip runs hot on a 60-bar curve of the episode', () => {
    expect(hotRangeOf(720_000, 750_000, 2_880_000, 60)).toEqual([15, 15]);
    expect(hotRangeOf(720_000, 810_000, 2_880_000, 60)).toEqual([15, 16]);
    expect(hotRangeOf(0, 10, 0, 60)).toBeUndefined();
    expect(hotRangeOf(2_870_000, 2_900_000, 2_880_000, 60)).toEqual([59, 59]);
  });
});

describe('the clip page (clip--screen)', () => {
  it('plays the clip at once and shows the range chip, the author, the title, the caption and "CLIP · 30 s"', async () => {
    mockClip = clip();
    const r = await mount(createElement(ClipScreen));
    expect(mockPlayClip).toHaveBeenCalledWith(mockEpisode, { startMs: 722_000, endMs: 752_000 });
    const t = texts(r);
    for (const s of ['CLIP · 30 s', '12:02 – 12:32', 'Rui', 'Why mornings matter', '“the part I replay every morning”']) expect(t).toContain(s);
    expect(byLabel(r, 'by Rui')).toHaveLength(0); // a link, not a button
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'by Rui' && n.props['accessibilityRole'] === 'link').length).toBeGreaterThan(0);
  });

  it('the ring\'s disc is Play the clip, 12:02 to 12:32; while the clip plays it is Pause', async () => {
    mockClip = clip();
    const r = await mount(createElement(ClipScreen));
    await press(r, 'Play the clip, 12:02 to 12:32');
    expect(mockPlayClip).toHaveBeenCalledTimes(2);
    act(() => r.unmount());
    rendered.pop();
    mockState = { kind: 'playing', episodeId: 'e1', positionMs: 730_000, lastSavedMs: 0 };
    mockClipPlaying = { episodeId: 'e1', startMs: 722_000, endMs: 752_000 };
    const r2 = await mount(createElement(ClipScreen));
    await press(r2, 'Pause the clip');
    expect(mockPause).toHaveBeenCalledTimes(1);
  });

  it('"Play the episode" starts at the clip\'s start and opens the player', async () => {
    mockClip = clip();
    const r = await mount(createElement(ClipScreen));
    await press(r, 'Play the episode');
    expect(mockLoad).toHaveBeenCalledWith(mockEpisode, 'play');
    expect(mockSeek).toHaveBeenCalledWith(722_000);
    expect(mockPush).toHaveBeenCalledWith('/player');
  });

  it('with the episode already loaded it seeks and plays instead of loading again', async () => {
    mockClip = clip();
    mockState = { kind: 'paused', episodeId: 'e1', positionMs: 5, lastSavedMs: 0 };
    const r = await mount(createElement(ClipScreen));
    mockLoad.mockClear();
    await press(r, 'Play the episode');
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockSeek).toHaveBeenCalledWith(722_000);
    expect(mockPlay).toHaveBeenCalled();
  });

  it('the share circle is 48 and opens the share panel for the clip', async () => {
    mockClip = clip();
    const r = await mount(createElement(ClipScreen));
    expect(flat(hostOf(byLabel(r, 'Share this clip')[0]!))['width']).toBe(CLIP_PAGE.shareCircle);
    await press(r, 'Share this clip');
    expect(mockShare).toHaveBeenCalledTimes(1);
    expect((mockShare.mock.calls[0]![0] as { heading: string }).heading).toBe('Share this clip');
  });

  it('at the clip\'s end the ring turns into two pills: Keep listening and Open player', async () => {
    mockClip = clip();
    mockState = { kind: 'paused', episodeId: 'e1', positionMs: 752_000, lastSavedMs: 0 };
    mockClipPlaying = undefined;
    const r = await mount(createElement(ClipScreen));
    expect(r.root.findAll((n) => n.props['testID'] === 'clip-end-pills').length).toBeGreaterThan(0);
    expect(r.root.findAll((n) => n.props['testID'] === 'clip-ring')).toHaveLength(0);
    await press(r, 'Keep listening');
    expect(mockPlay).toHaveBeenCalledTimes(1);
    await press(r, 'Open player');
    expect(mockPush).toHaveBeenCalledWith('/player');
  });

  it('··· on someone else\'s clip holds Share as video and Report this clip (it opens the report sheet); no Delete', async () => {
    mockClip = clip();
    const r = await mount(createElement(ClipScreen));
    await press(r, 'More for this clip');
    expect(byLabel(r, 'Delete this clip')).toHaveLength(0);
    await press(r, 'Share as video');
    expect(mockVideo).toHaveBeenCalledTimes(1);
    await press(r, 'More for this clip');
    await press(r, 'Report this clip');
    expect(mockReport).toEqual({ kind: 'clip', id: 'c1', authorId: 'rui', label: 'clip' });
  });

  it('··· on your own clip holds Delete this clip; deleting marks it removed and says so', async () => {
    mockClip = clip({ author: { id: 'me', displayName: 'Ana' } });
    const r = await mount(createElement(ClipScreen));
    await press(r, 'More for this clip');
    expect(byLabel(r, 'Report this clip')).toHaveLength(0);
    await press(r, 'Delete this clip');
    await act(async () => { await Promise.resolve(); });
    expect(mockDelete).toHaveBeenCalledWith('c1');
    expect(texts(r)).toContain('This clip was removed. The episode is still here.');
    expect(byLabel(r, 'Share this clip')).toHaveLength(0);
    expect(byLabel(r, 'Play the episode').length).toBeGreaterThan(0);
  });

  it('signed out: the glass strip says so and has a hot-text Sign in link; the clip still plays', async () => {
    mockListener = undefined;
    mockClip = clip();
    const r = await mount(createElement(ClipScreen));
    expect(texts(r)).toContain('You are not signed in — clips play anyway. Sign in to follow people and make your own.');
    const link = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Sign in' && n.props['accessibilityRole'] === 'link')[0]!;
    act(() => { link.props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    expect(mockPlayClip).toHaveBeenCalled();
  });

  it('a removed clip does not play and says it was removed', async () => {
    mockClip = clip({ deleted: true });
    const r = await mount(createElement(ClipScreen));
    expect(mockPlayClip).not.toHaveBeenCalled();
    expect(texts(r)).toContain('This clip was removed. The episode is still here.');
    expect(r.root.findAll((n) => n.props['testID'] === 'clip-ring')).toHaveLength(0);
  });

  it('a missing clip is the grey not-found page with its line; offline says only so', async () => {
    const { ApiError } = jest.requireActual('@/social/api') as { ApiError: new (code: string, message: string, status: number) => Error };
    mockGetClipError = new ApiError('not_found', 'nope', 404);
    const r = await mount(createElement(ClipScreen));
    expect(texts(r)).toContain('No such clip.');
    expect(texts(r)).toContain('The link may be wrong, or the clip was deleted.');
    expect(r.root.findAll((n) => n.props['testID'] === 'page-glow').length).toBeGreaterThan(0);
    act(() => r.unmount()); rendered.pop();
    mockGetClipError = new ApiError('network', 'x', 0);
    const r2 = await mount(createElement(ClipScreen));
    expect(texts(r2)).toContain("Couldn't reach the server.");
    expect(texts(r2)).not.toContain('The link may be wrong');
  });
});

describe('the composer (clip-new--screen)', () => {
  it('the arc is the clip\'s share of the ring; a touch grabs the nearer end within 8 %', () => {
    const sh = rangeShares({ startMs: 722_000, endMs: 752_000 }, 2_880_000)!;
    expect(sh.from).toBeCloseTo(0.2507, 3);
    expect(sh.to).toBeCloseTo(0.2611, 3);
    expect(rangeShares({ startMs: 5, endMs: 1 }, 100)).toEqual({ from: 0.01, to: 0.05 }); // a range given backwards is drawn forwards
    expect(rangeShares({ startMs: 1, endMs: 2 }, undefined)).toBeUndefined();
    expect(edgeNear(0.24, sh)).toBe('start');
    expect(edgeNear(0.27, sh)).toBe('end');
    expect(edgeNear(0.6, sh)).toBeUndefined();
    expect(edgeNear(0.99, { from: 0.01, to: 0.1 })).toBe('start'); // across 12 o'clock
    expect(COMPOSER.grab).toBe(0.08);
  });

  const episode = { id: 'e1', url: 'https://cdn/e1.mp3', title: 'Why mornings matter', showTitle: 'Morning Notes', durationMs: 2_880_000, feedUrl: 'https://f/x.xml' } as never;
  const composer = async (extra: Record<string, unknown> = {}) => {
    const onSave = jest.fn();
    mockState = { kind: 'paused', episodeId: 'e1', positionMs: 752_000, lastSavedMs: 0 };
    const r = await mount(createElement(ClipComposer, { episode, initialPositionMs: 752_000, saving: false, onSave, ...extra }));
    return { r, onSave };
  };

  it('opens on the last 30 seconds: Start 12:02, End 12:32, "30 s"; the ring is 280, the range reads aloud', async () => {
    const { r } = await composer();
    const t = texts(r);
    for (const s of ['12:02', '12:32', '30 s', 'From Why mornings matter · now at 12:32']) expect(t).toContain(s);
    const grab = r.root.findAll((n) => n.props['testID'] === 'clip-range' && typeof n.type === 'string')[0]!;
    expect(grab.props['accessibilityLabel']).toBe('Clip range 12:02 to 12:32, 30 seconds');
    expect(COMPOSER.ring).toBe(280);
    expect(flat(grab)['width']).toBe(280 + 2 * COMPOSER.arc);
  });

  it('the nudge rows: 36 chips; −5 s / +5 s move an end by five seconds; Start here / End here follow the playhead', async () => {
    const { r } = await composer();
    expect(flat(hostOf(byLabel(r, 'Start 5 seconds earlier')[0]!))['height']).toBe(36);
    await press(r, 'Start 5 seconds earlier');
    expect(texts(r)).toContain('11:57');
    expect(texts(r)).toContain('35 s');
    await press(r, 'End 5 seconds later');
    expect(texts(r)).toContain('12:37');
    expect(texts(r)).toContain('40 s');
    await press(r, 'Start here');
    expect(texts(r)).toContain('12:32'); // the playhead is at 12:32: the start moved to it, the range now says why it cannot save
  });

  it('a range that cannot be a clip says why, and Save does nothing', async () => {
    const { r, onSave } = await composer();
    await press(r, 'Start here'); // start = end = 12:32
    expect(texts(r)).toContain('The end must come after the start.');
    const save = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Save')[0]!;
    expect(save.props['accessibilityState']?.disabled).toBe(true);
    expect(save.props['onPress']).toBeUndefined();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Preview plays the range; Save hands over the range and the caption', async () => {
    const { r, onSave } = await composer();
    await press(r, 'Preview');
    expect(mockPlayClip).toHaveBeenCalledWith(episode, { startMs: 722_000, endMs: 752_000 });
    const field = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Caption' && typeof n.props['onChangeText'] === 'function')[0]!;
    expect(field.props['maxLength']).toBe(200);
    act(() => { field.props['onChangeText']('hello'); });
    await press(r, 'Save');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ range: { startMs: 722_000, endMs: 752_000 }, caption: 'hello' });
  });

  it('opens on a picked range and caption (from the transcript)', async () => {
    const { r } = await composer({ initialRange: { startMs: 60_000, endMs: 75_000 }, initialCaption: 'Before the phone' });
    expect(texts(r)).toContain('15 s');
    expect(texts(r)).toContain('Before the phone');
  });
});

describe('the New clip page (app/clip/new.tsx)', () => {
  it('signed out: "Sign in to make a clip." with its line and a Sign in pill that opens sign-in', async () => {
    mockListener = undefined;
    const r = await mount(createElement(NewClipScreen));
    expect(texts(r)).toContain('Sign in to make a clip.');
    expect(texts(r)).toContain('Clips are yours to share; they need an account.');
    await press(r, 'Sign in');
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });
  it('an episode that is not in the library: the grey page with its line and Back only', async () => {
    mockParams = { episodeId: 'nope' };
    const r = await mount(createElement(NewClipScreen));
    expect(texts(r)).toContain('Not in the library');
    expect(texts(r)).toContain('This episode is not in the library.');
    expect(r.root.findAll((n) => n.props['testID'] === 'page-glow').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Back').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Save')).toHaveLength(0);
  });
  it('Save: sent opens the share panel "Clip saved — share it" (closing it goes back)', async () => {
    mockCreate.mockResolvedValue({ kind: 'sent', clip: { id: 'c9', startMs: 722_000, endMs: 752_000 } });
    mockState = { kind: 'paused', episodeId: 'e1', positionMs: 752_000, lastSavedMs: 0 };
    const r = await mount(createElement(NewClipScreen));
    await press(r, 'Save');
    await act(async () => { await Promise.resolve(); });
    expect(mockCreate).toHaveBeenCalledWith('e1', { startMs: 722_000, endMs: 752_000 }, '', 2_880_000);
    const req = mockShare.mock.calls[0]![0] as { heading: string; onClosed: () => void };
    expect(req.heading).toBe('Clip saved — share it');
    req.onClosed();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('Save while offline: the toast says it will be sent, and the page closes', async () => {
    mockCreate.mockResolvedValue({ kind: 'pending' });
    mockState = { kind: 'paused', episodeId: 'e1', positionMs: 752_000, lastSavedMs: 0 };
    const r = await mount(createElement(NewClipScreen));
    await press(r, 'Save');
    await act(async () => { await Promise.resolve(); });
    expect(mockToast).toHaveBeenCalledWith('Clip saved — it will be sent when you are online.');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('a range the server refuses: the toast gives the reason and the page stays', async () => {
    mockCreate.mockResolvedValue({ kind: 'invalid', reason: 'too_long' });
    mockState = { kind: 'paused', episodeId: 'e1', positionMs: 752_000, lastSavedMs: 0 };
    const r = await mount(createElement(NewClipScreen));
    await press(r, 'Save');
    await act(async () => { await Promise.resolve(); });
    expect(mockToast).toHaveBeenCalledWith("That range can't be a clip (too_long).");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
