// Tests what a Moments card's buttons do: the sound through the main player, Play, react, comments, share.
/**
 * M31 T025 (research T020 §4 rules 3 and 4). Sound is the main player in clip mode over the moment's
 * preview range; if something else is playing the first tap asks "Switch to this moment?"; on mobile
 * data with the switch off the existing prompt (`askMobileData`) opens from the tap and its Allow replays
 * the moment; nothing here runs from a scroll. Play loads the episode, seeks to the moment and opens
 * the player. Flame, comments and share need the episode on the phone / a signed-in listener as before.
 *
 * The breaks that turn it red: call `player.playClip` before the `mayStreamNow` check (the data case
 * plays on mobile data); drop `otherPlaying` from `toggleSound` (a second stream mixes in).
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useMomentActions, type MomentActions } from '@/ui/discover/useMomentActions';
import { previewRange } from '@/ui/discover/moments-logic';
import type { Moment } from '@/discover/moments-api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
const mockToast = jest.fn();
const mockHave = new Set<string>();
const mockStores = { settings: { get: () => undefined }, feeds: { getEpisode: (id: string) => (mockHave.has(id) ? { id } : undefined) } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
const mockApi = { social: jest.fn(), react: jest.fn() };
let mockListener: unknown;
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi, listener: mockListener }) }));
let mockState: Record<string, unknown>;
let mockClip: { episodeId: string; startMs: number; endMs: number } | undefined;
const mockPlayer = { getState: () => mockState, clip: () => mockClip, playClip: jest.fn(), pause: jest.fn(), play: jest.fn(), load: jest.fn(), seek: jest.fn() };
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => (mockHave.has(id) ? { id, url: mockUrl, title: 't', showTitle: 's' } : undefined) }));
let mockUrl = 'https://a/e.mp3';
const mockRefresh = jest.fn();
jest.mock('@/feeds/fetch', () => ({ refreshShow: (...a: unknown[]) => mockRefresh(...a) }));
let mockMay = true;
jest.mock('@/settings/playback', () => ({ mayStreamNow: () => mockMay }));
jest.mock('@/downloads/expo-network', () => ({ createExpoNetwork: () => ({ kind: async () => 'cellular' }) }));
const mockAsk = jest.fn();
jest.mock('@/ui/player/DataPrompt', () => ({ askMobileData: (...a: unknown[]) => mockAsk(...a) }));
const mockChart = jest.fn();
jest.mock('@/discover/explore-api', () => ({ useExploreApi: () => ({ chart: mockChart }) }));

const M: Moment = { episodeId: 'e1', showTitle: 'S', episodeTitle: 'E', startMs: 872_000, endMs: 910_000, reactions: 9, rank: 1, followed: true, comments: [] };
let r: ReactTestRenderer | undefined;
let hook!: MomentActions;
const setHook = (v: MomentActions): void => { hook = v; };
function Probe(): null { setHook(useMomentActions(undefined)); return null; }
beforeEach(() => {
  for (const f of [mockPush, mockToast, mockRefresh, mockAsk, mockChart, mockApi.social, mockApi.react, ...Object.values(mockPlayer).filter((v) => typeof v === 'function' && 'mock' in v)] as jest.Mock[]) f.mockReset();
  mockHave.clear(); mockHave.add('e1');
  mockState = { kind: 'idle' }; mockClip = undefined; mockMay = true; mockUrl = 'https://a/e.mp3'; mockListener = { listenerId: 'u1' };
  mockPlayer.getState = () => mockState; mockPlayer.clip = () => mockClip;
  act(() => { r = create(createElement(Probe)); });
});
afterEach(() => { act(() => r?.unmount()); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('sound', () => {
  it('starts the moment\'s preview range through the main player, and does not open Switch?', async () => {
    act(() => hook.toggleSound(M, false));
    await flush();
    expect(mockPlayer.playClip).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), previewRange(M));
    expect(hook.pendingSwitch).toBeUndefined();
    expect(mockAsk).not.toHaveBeenCalled();
  });
  it('on mobile data with the switch off: the data prompt opens from the tap, nothing plays; Allow replays the moment', async () => {
    mockMay = false; mockAsk.mockReturnValue(true);
    act(() => hook.toggleSound(M, false));
    await flush();
    expect(mockPlayer.playClip).not.toHaveBeenCalled();
    expect(mockAsk).toHaveBeenCalledTimes(1);
    const { retry } = mockAsk.mock.calls[0]![0] as { retry: () => void };
    retry();
    expect(mockPlayer.playClip).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), previewRange(M));
  });
  it('a downloaded episode (a file, not a stream) needs no data question', async () => {
    mockMay = false; mockUrl = 'file:///x.mp3';
    act(() => hook.toggleSound(M, false));
    await flush();
    expect(mockAsk).not.toHaveBeenCalled();
    expect(mockPlayer.playClip).toHaveBeenCalled();
  });
  it('with no prompt mounted the refusal is said in a toast', async () => {
    mockMay = false; mockAsk.mockReturnValue(false);
    act(() => hook.toggleSound(M, false));
    await flush();
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('mobile data is off'));
  });
  it('something else playing: ask first; Switch plays, Cancel does not', async () => {
    mockState = { kind: 'playing', episodeId: 'other' };
    act(() => hook.toggleSound(M, false));
    expect(hook.pendingSwitch).toBe(M);
    expect(mockPlayer.playClip).not.toHaveBeenCalled();
    act(() => hook.cancelSwitch());
    expect(hook.pendingSwitch).toBeUndefined();
    act(() => hook.toggleSound(M, false));
    act(() => hook.confirmSwitch());
    await flush();
    expect(hook.pendingSwitch).toBeUndefined();
    expect(mockPlayer.playClip).toHaveBeenCalledTimes(1);
  });
  it('the main player playing THIS moment\'s clip is not "something else"; a tap with sound on pauses', async () => {
    mockState = { kind: 'playing', episodeId: 'e1' }; mockClip = { episodeId: 'e1', startMs: 872_000, endMs: 892_000 };
    act(() => hook.toggleSound(M, true));
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(hook.pendingSwitch).toBeUndefined();
  });
  it('stopSound pauses only the clip this card started', () => {
    mockState = { kind: 'playing', episodeId: 'e1' }; mockClip = { episodeId: 'e1', startMs: 872_000, endMs: 892_000 };
    hook.stopSound(M);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    hook.stopSound({ ...M, startMs: 5 });
    hook.stopSound({ ...M, episodeId: 'zz' });
    mockState = { kind: 'paused', episodeId: 'e1' };
    hook.stopSound(M);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });
});

describe('Play', () => {
  it('loads the episode, seeks to the moment and opens the player', async () => {
    act(() => hook.playFull(M));
    await flush();
    expect(mockPlayer.load).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }), 'play');
    expect(mockPlayer.seek).toHaveBeenCalledWith(872_000);
    expect(mockPush).toHaveBeenCalledWith('/player');
  });
  it('the episode already loaded: seek and play, no new load', async () => {
    mockState = { kind: 'paused', episodeId: 'e1' };
    act(() => hook.playFull(M));
    await flush();
    expect(mockPlayer.load).not.toHaveBeenCalled();
    expect(mockPlayer.seek).toHaveBeenCalledWith(872_000);
    expect(mockPlayer.play).toHaveBeenCalled();
  });
  it('a chart episode the phone has not got: its show\'s feed is fetched first, from the chart card', async () => {
    mockHave.clear();
    mockChart.mockResolvedValue({ items: [{ episode: { id: 'e1', feedUrl: 'https://feed/e1' } }] });
    mockRefresh.mockImplementation(async () => { mockHave.add('e1'); });
    act(() => hook.playFull(M));
    await flush(); await flush();
    expect(mockRefresh).toHaveBeenCalledWith('https://feed/e1', expect.anything(), expect.any(Number));
    expect(mockPlayer.load).toHaveBeenCalled();
  });
  it('a moment that carries its feedUrl is fetched from it directly: the chart is never asked (L5)', async () => {
    mockHave.clear();
    mockRefresh.mockImplementation(async () => { mockHave.add('e1'); });
    act(() => hook.playFull({ ...M, feedUrl: 'https://feed/own', guid: 'g1' }));
    await flush(); await flush();
    expect(mockRefresh).toHaveBeenCalledWith('https://feed/own', expect.anything(), expect.any(Number));
    expect(mockChart).not.toHaveBeenCalled();
    expect(mockPlayer.load).toHaveBeenCalled();
  });
  it('an episode nobody can find is said in a toast and nothing plays', async () => {
    mockHave.clear();
    mockChart.mockResolvedValue({ items: [] });
    act(() => hook.playFull(M));
    await flush(); await flush();
    expect(mockToast).toHaveBeenCalledWith("That episode isn't available to play right now.");
    expect(mockPlayer.load).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('a second tap while the first is still fetching does nothing', async () => {
    mockHave.clear();
    let release!: () => void;
    mockChart.mockResolvedValue({ items: [{ episode: { id: 'e1', feedUrl: 'https://feed/e1' } }] });
    mockRefresh.mockImplementation(() => new Promise<void>((res) => { release = () => { mockHave.add('e1'); res(); }; }));
    act(() => { hook.playFull(M); hook.playFull(M); });
    await flush(); await flush();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await Promise.resolve(); });
  });
});

describe('comments, flame, share', () => {
  it('comments open the episode\'s comments at the moment', () => {
    hook.comments(M);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/comments/[episodeId]', params: { episodeId: 'e1', at: '872000' } });
  });
  it('the flame, signed out, goes to sign-in and reacts to nothing', async () => {
    mockListener = undefined;
    act(() => { r!.update(createElement(Probe)); });
    expect(await hook.react(M, 2_890_000)).toBeUndefined();
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
    expect(mockApi.react).not.toHaveBeenCalled();
  });
  it('the flame reacts from the middle of the moment and answers the new state', async () => {
    mockApi.react.mockResolvedValue({ reacted: true, bucket: 30 });
    expect(await hook.react(M, 2_890_000)).toBe(true);
    expect(mockApi.react).toHaveBeenCalledWith('e1', 891_000, 2_890_000);
  });
  it('without the episode\'s length it asks the server for it first; if that fails it says so', async () => {
    mockApi.social.mockResolvedValue({ status: 200, body: { episode: { durationMs: 2_890_000 } } });
    mockApi.react.mockResolvedValue({ reacted: false, bucket: 30 });
    expect(await hook.react(M, undefined)).toBe(false);
    expect(mockApi.react).toHaveBeenCalledWith('e1', 891_000, 2_890_000);
    mockApi.social.mockResolvedValue({ status: 304 });
    expect(await hook.react(M, undefined)).toBeUndefined();
    expect(mockToast).toHaveBeenCalledWith("Couldn't react just now — try again.");
    mockApi.react.mockRejectedValue(new Error('down'));
    expect(await hook.react(M, 2_890_000)).toBeUndefined();
  });
  it('share opens the clip maker on the moment\'s range; signed out it goes to sign-in', async () => {
    act(() => hook.share(M));
    await flush();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/clip/new', params: { episodeId: 'e1', startMs: '872000', endMs: '910000', positionMs: '910000' } });
    mockPush.mockClear();
    mockListener = undefined;
    act(() => { r!.update(createElement(Probe)); });
    act(() => hook.share(M));
    await flush();
    expect(mockPush).toHaveBeenCalledWith('/auth/sign-in');
  });
});
