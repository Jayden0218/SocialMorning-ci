/**
 * The expo-audio adapter, with the native module MOCKED.
 *
 * READ THIS BEFORE TRUSTING IT: a mock tests the translation, not the
 * library. Everything here says "given a status stream shaped like this, the
 * adapter emits that" — it says NOTHING about whether Android actually
 * delivers such a stream, whether a call produces an unrequested pause, or
 * whether the lock screen appears. All of that is quickstart Tier B, on a
 * phone, and is NOT VERIFIED.
 */
import type { AudioStatus } from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { createExpoAudioAdapter, type AdapterEvent } from '../src/playback/expo-audio-adapter';
import type { Effect } from '../src/playback/types';

// jest.mock factories are hoisted, so anything they touch must be named
// `mock*` — jest's own guard against uninitialised captures.
const mockSetAudioModeAsync = jest.fn(async () => undefined);
const mockAppStateHandlers: ((state: string) => void)[] = [];

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...(args as [])),
}));

// react-native is NOT mocked wholesale: jest-expo's own setup needs the real
// Platform, and replacing the module breaks it before any test runs. Only
// AppState.addEventListener is intercepted.
beforeEach(() => {
  mockSetAudioModeAsync.mockResolvedValue(undefined);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type: string, handler: (state: AppStateStatus) => void) => {
      const cast = handler as (state: string) => void;
      mockAppStateHandlers.push(cast);
      return {
        remove: () => {
          const at = mockAppStateHandlers.indexOf(cast);
          if (at >= 0) mockAppStateHandlers.splice(at, 1);
        },
      } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
});

type Calls = string[];

function fakePlayer(calls: Calls): {
  player: Parameters<typeof createExpoAudioAdapter>[0] extends () => infer P ? P : never;
  emit: (status: Partial<AudioStatus>) => void;
} {
  let statusListener: ((status: AudioStatus) => void) | undefined;
  const player = {
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    replace: (source: { uri: string }) => calls.push(`replace:${source.uri}`),
    seekTo: async (seconds: number) => void calls.push(`seekTo:${seconds}`),
    setPlaybackRate: (rate: number, quality?: string) => calls.push(`rate:${rate}:${quality ?? ''}`),
    setActiveForLockScreen: (active: boolean, metadata?: unknown) =>
      calls.push(`lockScreen:${String(active)}:${JSON.stringify(metadata ?? null)}`),
    remove: () => calls.push('remove'),
    addListener: (_name: string, listener: (status: AudioStatus) => void) => {
      statusListener = listener;
      return {
        remove: () => {
          statusListener = undefined;
        },
      };
    },
  };
  const base: AudioStatus = {
    id: 'p',
    currentTime: 0,
    playbackState: 'readyToPlay',
    timeControlStatus: 'playing',
    reasonForWaitingToPlay: '',
    mute: false,
    duration: 0,
    playing: false,
    loop: false,
    didJustFinish: false,
    isBuffering: false,
    isLoaded: false,
    playbackRate: 1,
    shouldCorrectPitch: false,
    error: null,
    isLive: false,
  } as unknown as AudioStatus;

  return {
    player: player as never,
    emit: (status) => statusListener?.({ ...base, ...status }),
  };
}

function setup(): {
  calls: Calls;
  events: AdapterEvent[];
  emit: (status: Partial<AudioStatus>) => void;
  execute: (effect: Effect) => Promise<void>;
  adapter: ReturnType<typeof createExpoAudioAdapter>;
  unsubscribe: () => void;
} {
  const calls: Calls = [];
  const { player, emit } = fakePlayer(calls);
  const adapter = createExpoAudioAdapter(() => player);
  const events: AdapterEvent[] = [];
  const unsubscribe = adapter.subscribe((event) => void events.push(event));
  return { calls, events, emit, execute: adapter.execute, adapter, unsubscribe };
}

afterEach(() => {
  mockAppStateHandlers.length = 0;
  jest.restoreAllMocks();
});

describe('executing effects', () => {
  it('load replaces the source and seeks to the start position', async () => {
    const { calls, execute } = setup();
    await execute({ kind: 'load', url: 'https://cdn.example.com/1.mp3', startMs: 872_000 });
    expect(calls).toEqual(['replace:https://cdn.example.com/1.mp3', 'seekTo:872']);
  });

  it('play, pause and seek reach the player', async () => {
    const { calls, execute } = setup();
    await execute({ kind: 'play' });
    await execute({ kind: 'pause' });
    await execute({ kind: 'seek', toMs: 30_000 });
    expect(calls).toEqual(['play', 'pause', 'seekTo:30']);
  });

  // expo/expo#50072: play() is the only documented path that re-requests
  // Android audio focus, so that is literally what reassertFocus is.
  it('reassertFocus is play() again', async () => {
    const { calls, execute } = setup();
    await execute({ kind: 'reassertFocus' });
    expect(calls).toEqual(['play']);
  });

  // M2 (research R2): pitch preserved at 'high'.
  it('setRate reaches setPlaybackRate with pitch correction', async () => {
    const { calls, execute } = setup();
    await execute({ kind: 'setRate', rate: 1.5 });
    expect(calls).toEqual(['rate:1.5:high']);
  });

  it('setLockScreen passes the metadata and asks for the seek buttons', async () => {
    const { calls, execute } = setup();
    await execute({
      kind: 'setLockScreen',
      meta: { title: 'Episode 1', artist: 'A Show', artworkUrl: 'a.jpg' },
    });
    expect(calls[0]).toBe(
      'lockScreen:true:{"title":"Episode 1","artist":"A Show","artworkUrl":"a.jpg"}',
    );
  });

  it('setLockScreen copes with an episode that has no artwork', async () => {
    const { calls, execute } = setup();
    await execute({ kind: 'setLockScreen', meta: { title: 'E', artist: 'S' } });
    expect(calls[0]).toBe('lockScreen:true:{"title":"E","artist":"S"}');
  });

  it('clearLockScreen deactivates it', async () => {
    const { calls, execute } = setup();
    await execute({ kind: 'clearLockScreen' });
    expect(calls).toEqual(['lockScreen:false:null']);
  });

  it('ignores the effects the store owns', async () => {
    const { calls, execute } = setup();
    for (const effect of [
      { kind: 'savePosition', episodeId: 'e', offsetMs: 0, finished: false },
      { kind: 'saveSession', episodeId: 'e', intent: 'play' },
      { kind: 'startResumeWatch', ms: 1 },
      { kind: 'scheduleRetry', ms: 1 },
      { kind: 'notify', message: 'x' },
    ] as Effect[]) {
      await execute(effect);
    }
    expect(calls).toEqual([]);
  });

  it('configure sets doNotMix, background playback and silent-mode playback', async () => {
    const { adapter } = setup();
    await adapter.configure();
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
    });
  });

  // The default argument is the real path the app takes: one player created
  // by expo-audio for the app's life. Untested, it is the one line in this
  // file that only ever runs on a device.
  it('creates its own player from expo-audio when none is injected', () => {
    const calls: Calls = [];
    const { player } = fakePlayer(calls);
    (createAudioPlayer as jest.Mock).mockReturnValue(player);

    const adapter = createExpoAudioAdapter();
    adapter.release();

    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['remove']);
  });

  // A player call that throws — a seek past the end of a stream, say — must
  // not wedge every effect after it. The chain is serial; it is not a
  // single-use fuse.
  it('an effect that throws does not stall the ones behind it', async () => {
    const calls: Calls = [];
    const { player } = fakePlayer(calls);
    (player as unknown as { play: () => void }).play = () => {
      throw new Error('native blew up');
    };
    const adapter = createExpoAudioAdapter(() => player);

    await expect(adapter.execute({ kind: 'play' })).resolves.toBeUndefined();
    await adapter.execute({ kind: 'pause' });
    await adapter.execute({ kind: 'seek', toMs: 1_000 });

    expect(calls).toEqual(['pause', 'seekTo:1']);
  });

  it('release removes the player', () => {
    const { calls, adapter } = setup();
    adapter.release();
    expect(calls).toEqual(['remove']);
  });
});

describe('translating the status stream', () => {
  it('reports a load completing, once, with the duration in ms', () => {
    const { events, emit } = setup();
    emit({ isLoaded: true, duration: 3_600 });
    emit({ isLoaded: true, duration: 3_600 });
    expect(events.filter((e) => e.type === 'LOADED')).toEqual([
      { type: 'LOADED', durationMs: 3_600_000 },
    ]);
  });

  // expo-audio reports 0 for a duration it does not know yet. Passing that
  // through would mark every episode finished the moment it loads.
  it('reports no duration rather than a duration of zero', () => {
    const { events, emit } = setup();
    emit({ isLoaded: true, duration: 0 });
    expect(events[0]).toEqual({ type: 'LOADED', durationMs: undefined });
  });

  it('an error short-circuits everything else in that status', () => {
    const { events, emit } = setup();
    emit({ isLoaded: true, playing: true, error: 'MediaCodec 0x80001001' });
    expect(events).toEqual([{ type: 'ERROR', message: 'MediaCodec 0x80001001' }]);
  });

  it('didJustFinish ends the episode and suppresses the tick', () => {
    const { events, emit } = setup();
    emit({ isLoaded: true, playing: true, didJustFinish: true, currentTime: 3_600 });
    expect(events.map((e) => e.type)).toEqual(['LOADED', 'ENDED']);
  });

  // H4 on build 13 (2026-09-22): a finished episode played again ended at "0:00", no
  // offer. expo-audio's finish status carries `playing: false`, but the early return
  // above left `wasPlaying` true; the seek-to-0 of the replay then reported
  // `playing: false, currentTime: 0` — read as an unrequested pause at 0.
  it('after a finish, the replay\'s seek status is not an interruption (G9)', async () => {
    const { events, emit, execute } = setup();
    await execute({ kind: 'play' });
    emit({ isLoaded: true, playing: true, currentTime: 100 });
    emit({ playing: false, didJustFinish: true, currentTime: 128 });
    await execute({ kind: 'seek', toMs: 0 });
    emit({ playing: false, currentTime: 0 }); // ExoPlayer's onPositionDiscontinuity(SEEK) status
    await execute({ kind: 'play' });
    emit({ playing: true, currentTime: 0 });
    emit({ playing: true, currentTime: 3 });
    emit({ playing: false, didJustFinish: true, currentTime: 128 });
    expect(events.map((e) => e.type)).toEqual(['LOADED', 'TICK', 'ENDED', 'TICK', 'TICK', 'ENDED']);
  });

  it('emits buffering edges, not every buffering status', () => {
    const { events, emit } = setup();
    emit({ isLoaded: true, isBuffering: true });
    emit({ isBuffering: true });
    emit({ isBuffering: false });
    emit({ isBuffering: false });
    expect(events.map((e) => e.type)).toEqual(['LOADED', 'BUFFER_START', 'BUFFER_END']);
  });

  it('a pause we asked for is not an interruption', async () => {
    const { events, emit, execute } = setup();
    emit({ isLoaded: true, playing: true });
    await execute({ kind: 'pause' });
    emit({ playing: false, currentTime: 100 });
    expect(events.map((e) => e.type)).not.toContain('EXTERNAL_PAUSE');
  });

  // The ONLY signal expo-audio gives that a call arrived.
  it('a pause we did not ask for is an interruption, carrying the position', () => {
    const { events, emit } = setup();
    emit({ isLoaded: true, playing: true });
    emit({ playing: false, currentTime: 872.4 });
    expect(events).toContainEqual({ type: 'EXTERNAL_PAUSE', at: 872_400 });
  });

  it('a resume we asked for is not an external resume', async () => {
    const { events, emit, execute } = setup();
    emit({ isLoaded: true, playing: false });
    await execute({ kind: 'play' });
    emit({ playing: true });
    expect(events.map((e) => e.type)).not.toContain('EXTERNAL_RESUME');
  });

  it('a resume we did not ask for is the interruption ending', () => {
    const { events, emit } = setup();
    emit({ isLoaded: true, playing: true });
    emit({ playing: false, currentTime: 10 });
    emit({ playing: true, currentTime: 10 });
    expect(events.map((e) => e.type)).toContain('EXTERNAL_RESUME');
  });

  it('ticks only while playing', () => {
    const { events, emit } = setup();
    emit({ isLoaded: true, playing: true, currentTime: 12.5, duration: 3_600 });
    emit({ playing: false, currentTime: 12.5 });
    const ticks = events.filter((e) => e.type === 'TICK');
    expect(ticks).toEqual([{ type: 'TICK', positionMs: 12_500, durationMs: 3_600_000 }]);
  });

  it('maps AppState to background and foreground', () => {
    const { events } = setup();
    mockAppStateHandlers[0]?.('background');
    mockAppStateHandlers[0]?.('active');
    mockAppStateHandlers[0]?.('inactive');
    expect(events.map((e) => e.type)).toEqual([
      'APP_BACKGROUND',
      'APP_FOREGROUND',
      'APP_BACKGROUND',
    ]);
  });

  it('a load resets the loaded flag so the next episode reports its own duration', async () => {
    const { events, emit, execute } = setup();
    emit({ isLoaded: true, duration: 100 });
    await execute({ kind: 'load', url: 'https://cdn.example.com/2.mp3', startMs: 0 });
    emit({ isLoaded: true, duration: 200 });
    expect(events.filter((e) => e.type === 'LOADED')).toEqual([
      { type: 'LOADED', durationMs: 100_000 },
      { type: 'LOADED', durationMs: 200_000 },
    ]);
  });

  it('unsubscribing stops the events', () => {
    const { events, emit, unsubscribe } = setup();
    unsubscribe();
    emit({ isLoaded: true });
    mockAppStateHandlers[0]?.('background');
    expect(events).toEqual([]);
  });
});
