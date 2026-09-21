/**
 * Ordering, which on Android is not a detail.
 *
 * Gate item 1 (ten minutes locked) fails at about three WITHOUT lock-screen
 * controls, and it fails quietly — it reads as a buffering or battery
 * problem. So `setActiveForLockScreen(true, …)` must land before `play()`,
 * and a recovered stall must finish seeking before it resumes.
 *
 * NOT VERIFIED: the native module is mocked. This pins the order of OUR
 * calls. Whether Android then keeps playing for ten minutes is quickstart
 * Tier B, on a phone.
 */
import { createExpoAudioAdapter } from '../src/playback/expo-audio-adapter';
import { reduce } from '../src/playback/reducer';
import {
  INITIAL_CONTEXT,
  INITIAL_STATE,
  type Effect,
  type PlayerContext,
  type PlayerState,
} from '../src/playback/types';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

type Call = { name: string; args: unknown[] };

function recordingPlayer(calls: Call[], seekDelayMs = 0): never {
  const push = (name: string, ...args: unknown[]): void => void calls.push({ name, args });
  return {
    play: () => push('play'),
    pause: () => push('pause'),
    replace: (source: unknown) => push('replace', source),
    seekTo: async (seconds: number) => {
      // A real seek is not instant. If effects were not serialised, whatever
      // came next would slip in front of this.
      await new Promise((resolve) => setTimeout(resolve, seekDelayMs));
      push('seekTo', seconds);
    },
    setActiveForLockScreen: (active: boolean, metadata?: unknown) =>
      push('setActiveForLockScreen', active, metadata),
    updateLockScreenMetadata: (metadata: unknown) => push('updateLockScreenMetadata', metadata),
    clearLockScreenControls: () => push('clearLockScreenControls'),
    remove: () => push('remove'),
    addListener: () => ({ remove: () => undefined }),
  } as never;
}

const META = { title: 'Episode 1', artist: 'A Show' };

/** Drive the real reducer and hand its effects to the real adapter, in order. */
async function drive(
  events: Parameters<typeof reduce>[1][],
  calls: Call[],
  seekDelayMs = 0,
): Promise<void> {
  const adapter = createExpoAudioAdapter(() => recordingPlayer(calls, seekDelayMs));
  let state: PlayerState = INITIAL_STATE;
  let ctx: PlayerContext = INITIAL_CONTEXT;
  const pending: Promise<void>[] = [];
  for (const event of events) {
    const step = reduce(state, event, ctx);
    state = step.state;
    ctx = step.ctx;
    for (const effect of step.effects as Effect[]) pending.push(adapter.execute(effect));
  }
  await Promise.all(pending);
}

const names = (calls: Call[]): string[] => calls.map((c) => c.name);

it('sets the lock screen BEFORE play on the load that starts audio', async () => {
  const calls: Call[] = [];
  await drive(
    [
      { type: 'LOAD', episodeId: 'e1', url: 'https://cdn/1.mp3', startMs: 0, intent: 'play', meta: META },
      { type: 'LOADED', loadId: 1, durationMs: 3_600_000 },
    ],
    calls,
  );

  const order = names(calls);
  expect(order).toContain('setActiveForLockScreen');
  expect(order).toContain('play');
  expect(order.indexOf('setActiveForLockScreen')).toBeLessThan(order.indexOf('play'));
  expect(calls.find((c) => c.name === 'setActiveForLockScreen')?.args[0]).toBe(true);
  expect(calls.find((c) => c.name === 'setActiveForLockScreen')?.args[1]).toEqual(META);
});

it('finishes seeking before it resumes after a recovered stall', async () => {
  const calls: Call[] = [];
  await drive(
    [
      { type: 'LOAD', episodeId: 'e1', url: 'https://cdn/1.mp3', startMs: 0, intent: 'play', meta: META },
      { type: 'LOADED', loadId: 1, durationMs: 3_600_000 },
      { type: 'TICK', positionMs: 100_000, durationMs: 3_600_000 },
      { type: 'ERROR', message: 'stalled' },
      { type: 'RETRY_DUE' },
    ],
    calls,
    5,
  );

  const order = names(calls);
  const reload = order.lastIndexOf('replace');
  const reseek = order.lastIndexOf('seekTo');
  const resume = order.lastIndexOf('play');
  expect(reload).toBeLessThan(reseek);
  // Without the effect chain this fails: play() would fire while the seek
  // was still awaiting, and the episode would resume from the wrong place.
  expect(reseek).toBeLessThan(resume);
  expect(calls[reseek]?.args[0]).toBe(100);
});

it('updates the metadata for a second episode instead of re-activating', async () => {
  const calls: Call[] = [];
  await drive(
    [
      { type: 'LOAD', episodeId: 'e1', url: 'https://cdn/1.mp3', startMs: 0, intent: 'play', meta: META },
      { type: 'LOADED', loadId: 1, durationMs: 1_000 },
      {
        type: 'LOAD',
        episodeId: 'e2',
        url: 'https://cdn/2.mp3',
        startMs: 0,
        intent: 'play',
        meta: { title: 'Episode 2', artist: 'A Show' },
      },
      { type: 'LOADED', loadId: 2, durationMs: 2_000 },
    ],
    calls,
  );

  // Tearing the controls down and putting them back flickers for the
  // listener and looks to Android like the session ended.
  expect(names(calls).filter((n) => n === 'setActiveForLockScreen')).toHaveLength(1);
  expect(calls.find((c) => c.name === 'updateLockScreenMetadata')?.args[0]).toEqual({
    title: 'Episode 2',
    artist: 'A Show',
  });
});

it('clears the lock screen when the episode ends', async () => {
  const calls: Call[] = [];
  await drive(
    [
      { type: 'LOAD', episodeId: 'e1', url: 'https://cdn/1.mp3', startMs: 0, intent: 'play', meta: META },
      { type: 'LOADED', loadId: 1, durationMs: 1_000 },
      { type: 'ENDED' },
    ],
    calls,
  );
  expect(calls.filter((c) => c.name === 'setActiveForLockScreen').map((c) => c.args[0])).toEqual([
    true,
    false,
  ]);
});

it('clears the lock screen when playback fails for good', async () => {
  const calls: Call[] = [];
  await drive(
    [
      { type: 'LOAD', episodeId: 'e1', url: 'https://cdn/1.mp3', startMs: 0, intent: 'pause', meta: META },
      { type: 'ERROR', message: 'gone' },
    ],
    calls,
  );
  expect(calls.filter((c) => c.name === 'setActiveForLockScreen').map((c) => c.args[0])).toEqual([
    false,
  ]);
});
