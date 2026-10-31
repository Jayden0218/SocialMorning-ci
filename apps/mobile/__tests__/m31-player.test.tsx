// Tests the Pulse player page: every part, every state and sheet of the drawings, and that a position tick never redraws the page.
/**
 * M31 T024 (design-pulse2 `index.html#player--screen`, `listen.html` player entries): the page is
 * rendered whole, over a REAL player runtime (a fake audio adapter drives it), with the app's contexts
 * stood in for. What it proves, in Jest (how it looks on a phone is NOT VERIFIED until a build is installed):
 *   - every part is there with its name (the action map): close, ring "Seek", skips, play/pause, the speed
 *     label, the moon, the tray (Comments n, React, Clip, Playlist, Share), Follow, the show link;
 *   - nothing playing, a failure (with and without an episode), the end of an episode with its offer, the
 *     clip-ended "Keep listening" — each in place of what the drawing says;
 *   - More (Clip, Share, Favourite, About, Transcript, Chapters), the Transcript sheet, the Playback sheet,
 *     the sleep sheet open from their buttons and do what they say;
 *   - guard G-M31-PLAYER-RENDERS: ten seconds of playback re-render the PAGE at most once (it redraws only
 *     the parts that draw the position). Review C4.
 *
 * The break that turns the render guard red: in src/ui/player/usePlayerScreen.ts read the clock in the page
 * (`usePlayerSelector(selectClock, sameClock)`), or `usePlayerState()`; the count then climbs with every second.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockOpenQueue = jest.fn();
const mockToggle = jest.fn();
const mockBump = jest.fn();
const mockPlayableLoad = jest.fn();
let mockListener: { listenerId: string } | undefined = { listenerId: 'me' };
let mockExtrasRow: Record<string, unknown> | undefined;
let mockNextUp: unknown[] = [];
let mockQueueIds: string[] = [];
const mockSettings = new Map<string, string>();
const mockCached = { social: { episode: { id: 'e1', durationMs: 600_000 }, comments: [] as unknown[], heat: { available: true, buckets: Array.from({ length: 100 }, (_, i) => (i === 40 || i === 41 ? 1 : 0.1)) }, myReactionBuckets: [] as number[] } };

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), navigate: (...a: unknown[]) => mockNavigate(...a), canGoBack: () => true, back: jest.fn() },
  useFocusEffect: () => undefined,
  usePathname: () => '/player',
  useIsFocused: () => true,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/shell/providers', () => {
  const stores = {
    settings: { get: (k: string) => mockSettings.get(k), set: (k: string, v: string) => { mockSettings.set(k, v); }, delete: (k: string) => { mockSettings.delete(k); } },
    feeds: {
      getEpisode: (id: string) => (id === 'e1' ? { id: 'e1', feedUrl: 'https://f/x.xml', title: 'Why mornings matter', imageUrl: 'https://img/e1.png', durationMs: 600_000, enclosureType: 'audio/mpeg', enclosureUrl: 'https://a/e1.mp3', transcripts: [], ...(mockExtrasRow ? { chaptersUrl: 'https://f/ch.json' } : {}) } : undefined),
      getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Morning Notes' }),
    },
    subscriptions: { has: () => false, add: jest.fn() },
    queue: { list: () => mockQueueIds },
    extras: { get: () => mockExtrasRow, put: () => undefined },
    speed: { get: () => undefined, set: () => undefined, clear: () => undefined },
  };
  return { useStores: () => stores, useSubscriptionSync: () => ({ push: jest.fn() }), useToast: () => jest.fn(), useDownloads: () => undefined };
});
jest.mock('@/social/context', () => {
  const value = {
    api: { nextUp: () => Promise.resolve({ items: mockNextUp }), recordShare: () => Promise.resolve(), showExtras: () => new Promise(() => undefined) },
    listener: undefined as unknown,
    composer: { open: jest.fn() },
    reactToggle: { isReacted: () => false, toggle: (...a: unknown[]) => { mockToggle(...a); return { optimistic: [41], settled: Promise.resolve({ myBuckets: [41] }) }; } },
    bump: (...a: unknown[]) => mockBump(...a),
    refresh: jest.fn(),
    useEpisodeSocial: () => ({ cached: mockCached, stale: false }),
  };
  return { useSocial: () => { value.listener = mockListener; return value; } };
});
jest.mock('@/social/usePoll', () => ({ usePoll: () => undefined }));
jest.mock('@/social/live', () => ({ liveLabel: (n: number | undefined) => (n !== undefined && n >= 2 ? `${n} listening now` : undefined), useListeningNow: () => undefined }));
jest.mock('@/ui/show/ShowExtras', () => ({ useShowExtras: () => [undefined, jest.fn()] }));
jest.mock('@/ui/queue/QueueSheetHost', () => ({ useQueueSheet: () => ({ open: mockOpenQueue, close: jest.fn() }), useSwipeUpToOpen: () => ({}) }));
jest.mock('@/ui/settings/AudioRows', () => ({ RouteRow: () => null, VoiceBoostRow: () => null, useEffectsBlocked: () => false }));
jest.mock('@/ui/comments/Composer', () => ({ ComposerSheet: () => null }));
jest.mock('@/ui/comments/MomentSheet', () => ({ MomentSheet: () => null }));
jest.mock('@/ui/clips/ShareChooser', () => {
  const { createElement: h } = jest.requireActual('react');
  return { ShareChooser: (p: { open: boolean }) => (p.open ? h('ShareChooserOpen', { accessibilityLabel: 'Share panel' }) : null) };
});
jest.mock('@/ui/player/QuoteShare', () => ({ useQuoteShare: () => jest.fn(), useQuoteVideo: () => undefined }));
jest.mock('@/discover/useDiscover', () => ({ useDiscover: () => ({ open: jest.fn() }) }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ id, url: 'https://a/x.mp3', title: 't', showTitle: 's' }) }));

import PlayerScreen from '../app/player';
import { PlayerProvider, createPlayerRuntime, type PlayableEpisode, type PlayerRuntime } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import { renderProbe } from '@/ui/player/usePlayerScreen';
import { resetReactionStore } from '@/ui/player/useReaction';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';

const EPISODE: PlayableEpisode = { id: 'e1', url: 'https://a/e1.mp3', title: 'Why mornings matter', showTitle: 'Morning Notes', feedUrl: 'https://f/x.xml' };

function harness(): { runtime: PlayerRuntime; push: (e: AdapterEvent) => void } {
  let listener: ((event: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = {
    execute: async () => undefined,
    subscribe: (l) => { listener = l; return () => undefined; },
    configure: async () => undefined,
    release: () => undefined,
  };
  const runtime = createPlayerRuntime({ adapter, stores: createMemoryStores(hash), now: () => 1, notify: () => undefined });
  return { runtime, push: (e) => listener?.(e) };
}

const rendered: ReactTestRenderer[] = [];
function mount(runtime: PlayerRuntime): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } },
      createElement(PlayerProvider, { runtime }, createElement(PlayerScreen))));
  });
  rendered.push(r);
  return r;
}
const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const find = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
const press = (r: ReactTestRenderer, label: string) => {
  const n = find(r, label);
  if (!n) throw new Error(`no pressable "${label}" in: ${labels(r).join(' | ')}`);
  act(() => { n.props['onPress'](); });
};
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

function playing(h: ReturnType<typeof harness>, positionMs = 0): void {
  act(() => { h.runtime.load(EPISODE, 'play'); });
  act(() => { h.push({ type: 'LOADED', durationMs: 600_000 }); });
  if (positionMs > 0) act(() => { h.push({ type: 'TICK', positionMs }); });
}

beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionForTest(true);
  mockPush.mockClear(); mockReplace.mockClear(); mockNavigate.mockClear(); mockOpenQueue.mockClear(); mockToggle.mockClear(); mockBump.mockClear(); mockPlayableLoad.mockClear();
  mockListener = { listenerId: 'me' };
  mockExtrasRow = undefined;
  mockNextUp = [];
  mockQueueIds = [];
  mockSettings.clear();
  mockCached.social.comments = [];
  resetReactionStore();
});
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => { r.unmount(); });
  act(() => { for (let i = 0; i < 100 && jest.getTimerCount() > 0; i++) jest.runOnlyPendingTimers(); });
  jest.clearAllTimers();
  jest.useRealTimers();
  setReducedMotionForTest(undefined);
});

describe('the page while an episode plays', () => {
  it('has every part of the drawing, each with its name', () => {
    const h = harness();
    playing(h, 12_000);
    const r = mount(h.runtime);
    const all = labels(r);
    for (const l of [
      'Close the player', 'More', 'Seek', 'Show: Morning Notes', 'Subscribe to this show',
      'Speed 1.0×, sleep timer and chapters', 'Skip back 15 seconds', 'Pause', 'Skip forward 30 seconds', 'Sleep timer, off',
      'Comments, 0', 'React at this moment', 'Clip the last 30 seconds', 'Playlist', 'Share this episode',
    ]) expect(all).toContain(l);
    expect(text(r)).toContain('Why mornings matter');
    expect(text(r)).toContain('Follow');
    // The hot-moment pill counts down to the next hot bar (bucket 40 of 100 on 10:00 = 4:00; we are at 0:12).
    expect(all.some((l) => /^next hot moment in 3:48\. Jump to it\.$/.test(l))).toBe(true);
  });

  it('the ring is ONE adjustable "Seek" with the time of day spoken, and the screen reader steps +30 / −15', () => {
    const h = harness();
    playing(h, 12_000);
    const r = mount(h.runtime);
    const ring = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Seek')[0]!;
    expect(ring.props['accessibilityRole']).toBe('adjustable');
    expect(ring.props['accessibilityValue']).toEqual({ text: '0:12 of 10:00' });
    const skip = jest.spyOn(h.runtime, 'skip');
    act(() => { ring.props['onAccessibilityAction']({ nativeEvent: { actionName: 'increment' } }); });
    act(() => { ring.props['onAccessibilityAction']({ nativeEvent: { actionName: 'decrement' } }); });
    expect(skip).toHaveBeenNthCalledWith(1, 30_000);
    expect(skip).toHaveBeenNthCalledWith(2, -15_000);
  });

  it('the transport does what it says: pause, play, skip back 15, forward 30', () => {
    const h = harness();
    playing(h, 100_000);
    const r = mount(h.runtime);
    const pause = jest.spyOn(h.runtime, 'pause');
    const skip = jest.spyOn(h.runtime, 'skip');
    press(r, 'Pause');
    expect(pause).toHaveBeenCalledTimes(1);
    press(r, 'Skip back 15 seconds');
    press(r, 'Skip forward 30 seconds');
    expect(skip.mock.calls).toEqual([[-15_000], [30_000]]);
    // The name follows the state, not only the glyph: paused → "Play", and it plays.
    expect(labels(r)).toContain('Play');
    const play = jest.spyOn(h.runtime, 'play');
    press(r, 'Play');
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('the speed label opens the Playback sheet; Done closes it', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    expect(labels(r)).not.toContain('Close the player settings');
    press(r, 'Speed 1.0×, sleep timer and chapters');
    const all = labels(r);
    for (const l of ['Close the player settings', 'Slower', 'Faster', '1.5×', 'Sleep in 15 minutes', 'More settings: loop, audio output, skip silence, voice boost']) expect(all).toContain(l);
    press(r, 'Faster');
    expect(h.runtime.rate()).toBeCloseTo(1.1, 5);
    press(r, '2×');
    expect(h.runtime.rate()).toBe(2);
    press(r, 'Sleep in 15 minutes');
    expect(h.runtime.sleepTimer().minutes).toBe(15);
    press(r, 'Close');
    expect(labels(r)).not.toContain('Close the player settings');
  });

  it('the moon opens the sleep clock; a time starts the timer and the moon says so; Cancel turns it off', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'Sleep timer, off');
    expect(labels(r)).toContain('Sleep in 45 minutes');
    press(r, 'Sleep in 45 minutes');
    expect(h.runtime.sleepTimer().minutes).toBe(45);
    expect(labels(r).some((l) => /^Sleep timer, pausing in 45:00$/.test(l))).toBe(true);
    press(r, 'Cancel the sleep timer');
    expect(h.runtime.sleepTimer().minutes).toBeUndefined();
  });

  it('the tray: Comments opens the conversation at this moment, Playlist the queue sheet, React reacts (signed out: sign in)', () => {
    const h = harness();
    playing(h, 42_000);
    const r = mount(h.runtime);
    press(r, 'Comments, 0');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/comments/[episodeId]', params: { episodeId: 'e1', at: '42000' } });
    press(r, 'Playlist');
    expect(mockOpenQueue).toHaveBeenCalledTimes(1);
    press(r, 'Clip the last 30 seconds');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/clip/new', params: { episodeId: 'e1', positionMs: '42000' } });
    press(r, 'React at this moment');
    expect(mockToggle).toHaveBeenCalledWith('e1', [], 42_000, 600_000);
  });

  it('React when signed out goes to the sign-in page and reacts to nothing', () => {
    mockListener = undefined;
    const h = harness();
    playing(h, 42_000);
    const r = mount(h.runtime);
    press(r, 'React at this moment');
    expect(mockPush).toHaveBeenLastCalledWith('/auth/sign-in');
    expect(mockToggle).not.toHaveBeenCalled();
    press(r, 'Clip the last 30 seconds');
    expect(mockPush).toHaveBeenLastCalledWith('/auth/sign-in');
  });

  it('Share opens the share panel; Follow subscribes', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    expect(labels(r)).not.toContain('Share panel');
    press(r, 'Share this episode');
    expect(labels(r)).toContain('Share panel');
    press(r, 'Subscribe to this show');
  });

  it('the show line opens the show page', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'Show: Morning Notes');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent('https://f/x.xml') } });
  });

  it('a state line sits at the end of the show line: Buffering…, the headphones, then nothing when it plays on', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    expect(text(r)).not.toContain('Buffering…');
    act(() => { h.push({ type: 'BUFFER_START' }); });
    expect(text(r)).toContain('Buffering…');
    act(() => { h.push({ type: 'BUFFER_END' }); });
    expect(text(r)).not.toContain('Buffering…');
    act(() => { h.push({ type: 'OUTPUT_LOST' }); });
    expect(text(r)).toContain('Paused — your headphones disconnected');
  });
});

describe('the More sheet, the Transcript sheet and Chapters (moved here from the Playback sheet)', () => {
  const extras = {
    chaptersJson: JSON.stringify([{ startMs: 0, title: 'Cold open' }, { startMs: 252_000, title: 'Why the first hour counts' }]),
    transcriptJson: JSON.stringify({ lines: [{ startMs: 1000, text: 'Hello there.' }, { startMs: 5000, text: 'Second line.' }] }),
    fetchedAt: 1,
  };

  it('More shows Clip, Share, Add to favourites and About; Favourite flips its name and fills; About opens the episode page', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'More');
    const all = labels(r);
    for (const l of ['Clip the last 30 seconds', 'Share this episode', 'Add to favourites', 'About this episode']) expect(all).toContain(l);
    expect(all).not.toContain('Transcript'); // none for this episode: the tile is hidden, as it was
    expect(all.some((l) => l.startsWith('Chapters ('))).toBe(false);
    press(r, 'Add to favourites');
    expect(labels(r)).toContain('Remove from favourites');
    press(r, 'About this episode');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'e1' } });
  });

  it('with chapters and a transcript the tiles appear; Chapters opens the list and a chapter seeks; Transcript opens its sheet', () => {
    mockExtrasRow = extras;
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'More');
    expect(labels(r)).toContain('Transcript');
    expect(labels(r)).toContain('Chapters (2)');
    // Round 2: the drawn state is "Chapters on, the list open"; the tile folds it and opens it again.
    expect(labels(r)).toContain('Chapter 2, Why the first hour counts');
    press(r, 'Chapters (2)');
    expect(labels(r)).not.toContain('Chapter 2, Why the first hour counts');
    press(r, 'Chapters (2)');
    expect(labels(r)).toContain('Chapter 2, Why the first hour counts');
    const seek = jest.spyOn(h.runtime, 'seek');
    press(r, 'Chapter 2, Why the first hour counts');
    expect(seek).toHaveBeenCalledWith(252_000);
    press(r, 'Transcript');
    expect(labels(r)).toContain('Open the transcript full screen');
    press(r, 'Open the transcript full screen');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/transcript/[episodeId]', params: { episodeId: 'e1' } });
    expect(text(r)).toContain('Hello there.');
  });

  it('"Show transcript entry" off hides the Transcript tile', () => {
    mockExtrasRow = extras;
    mockSettings.set('pref.transcriptEntry', '0');
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    press(r, 'More');
    expect(labels(r)).not.toContain('Transcript');
    expect(labels(r)).toContain('Chapters (2)');
  });
});

describe('nothing playing, a failure, the end', () => {
  it('nothing playing: the empty ring, the sentence and two shortcuts (Discover, Queue); close stays', () => {
    const h = harness();
    const r = mount(h.runtime);
    expect(text(r)).toContain('Nothing is playing yet.');
    expect(labels(r)).toContain('Close the player');
    press(r, 'Discover');
    expect(mockNavigate).toHaveBeenCalledWith('/');
    press(r, 'Queue');
    expect(mockPush).toHaveBeenCalledWith('/queue');
    expect(labels(r)).not.toContain('Skip back 15 seconds');
    expect(labels(r)).not.toContain('Comments, 0'); // no tray
  });

  it('a failure with the episode: the play disc becomes "Try again", and the message is the state line', () => {
    const h = harness();
    playing(h, 5_000);
    act(() => { h.runtime.pause(); }); // a failure while paused is final; while playing the runtime retries first
    const r = mount(h.runtime);
    act(() => { h.push({ type: 'ERROR', message: 'x' }); });
    expect(h.runtime.getState().kind).toBe('error');
    expect(labels(r)).not.toContain('Pause');
    expect(text(r)).toContain('This episode could not be played');
    const play = jest.spyOn(h.runtime, 'play');
    press(r, 'Try again');
    expect(play).toHaveBeenCalledTimes(1);
    // The rest of the page is still there (the ring, the tray).
    expect(labels(r)).toContain('Seek');
    expect(labels(r)).toContain('Playlist');
  });

  it('the end of an episode with something to offer: the offer card takes the controls\' place; Play it plays that one', async () => {
    mockNextUp = [{ episode: { id: 'n1', feedUrl: 'https://f/x.xml', guid: 'n1', title: 'Cities that sleep late', showTitle: 'Night Shift Radio', enclosureUrl: 'https://a/n1.mp3' }, reason: 'inQueue', label: 'From your queue' }];
    const h = harness();
    playing(h, 599_000);
    const r = mount(h.runtime);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => { h.push({ type: 'ENDED' }); });
    expect(text(r)).toContain('Finished');
    expect(text(r)).toContain('Cities that sleep late');
    expect(text(r)).toContain('FROM YOUR QUEUE');
    expect(labels(r)).not.toContain('Skip back 15 seconds'); // the offer replaces the controls
    expect(labels(r)).toContain('Comments, 0'); // the tray stays
    const load = jest.spyOn(h.runtime, 'load');
    press(r, 'Play it');
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), 'play');
  });

  it('the end with nothing to offer keeps the controls (to play it again)', async () => {
    const h = harness();
    playing(h, 599_000);
    const r = mount(h.runtime);
    await act(async () => { await Promise.resolve(); });
    act(() => { h.push({ type: 'ENDED' }); });
    expect(text(r)).toContain('Finished');
    expect(labels(r)).toContain('Skip back 15 seconds');
    expect(labels(r)).not.toContain('Play it');
  });

  it('a failure with no episode: the empty ring says the message, with Try again, Discover and Queue', () => {
    const play = jest.fn();
    const state = { kind: 'error', message: 'Nothing could be loaded.' };
    const stub = { getState: () => state, subscribe: () => () => undefined, play, clip: () => undefined, rate: () => 1, sleepTimer: () => ({ endOfEpisode: false }), sleepRemainingMs: () => undefined, loop: () => false } as unknown as PlayerRuntime;
    const r = mount(stub);
    expect(text(r)).toContain('Nothing could be loaded.');
    for (const l of ['Try again', 'Discover', 'Queue']) expect(labels(r)).toContain(l);
    press(r, 'Try again');
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe('guard G-M31-PLAYER-RENDERS: a position tick redraws the parts that draw it, not the page', () => {
  it('10 seconds of playback (20 ticks) re-render the page at most once', () => {
    const h = harness();
    playing(h);
    const r = mount(h.runtime);
    const before = renderProbe.count;
    const seekBefore = (r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Seek')[0]!.props['accessibilityValue'] as { text: string }).text;
    for (let i = 1; i <= 20; i += 1) act(() => { h.push({ type: 'TICK', positionMs: i * 500 }); });
    const after = renderProbe.count;
    expect(after - before).toBeLessThanOrEqual(1);
    // Not vacuous: the ring DID follow the audio (its value text says 0:10 now).
    const seekAfter = (r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Seek')[0]!.props['accessibilityValue'] as { text: string }).text;
    expect(seekBefore).toBe('0:00 of 10:00');
    expect(seekAfter).toBe('0:10 of 10:00');
  });
});
