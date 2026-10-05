// Tests "Another app's short sound" (lower the volume / pause) and skip silence: what reaches the native side.
/**
 * M19 (owner, 2026-10-05; research R3 + R4 revised). Every new branch in src/playback (held at
 * 100 % branches):
 *   - adapter: `setPauseOnPrompts` reaches the patched native function BEFORE every
 *     setAudioModeAsync (configure, the effect, voice on/off); a build with no ExpoAudio module,
 *     or one without the function, is left alone;
 *   - adapter: `setSkipSilence` sets `player.skipSilence` only on a player that has it, and sets
 *     it again after every load while it is on (not while it is off);
 *   - store: `setSkipSilence` / `setPauseOnPrompts` send their effects.
 *
 * The break that turns it red: in src/playback/expo-audio-adapter.ts drop the line
 * `if (skipSilence) applySkipSilence();` (the load test fails).
 *
 * A mock tests the translation, not the phone: whether Android ducks and iOS pauses is NOT VERIFIED.
 */
import { createExpoAudioAdapter, voiceSessionOff, voiceSessionOn } from '@/playback/expo-audio-adapter';
import { createPlayerRuntime } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';
import type { Effect } from '@/playback/types';

// Everything the mocks write goes into one log, so the ORDER native-then-mode is checked.
const mockLog: string[] = [];
let mockNative: Record<string, unknown> | null = null;

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async (mode: { allowsRecording?: boolean }) => {
    mockLog.push(mode.allowsRecording === true ? 'mode:record' : 'mode:player');
  }),
}));

jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => (name === 'ExpoAudio' ? mockNative : null),
}));

beforeEach(() => {
  mockLog.length = 0;
  mockNative = { setPauseOnPrompts: (on: boolean) => { mockLog.push(`native:${on}`); } };
});

function fakePlayer(withSkipSilence: boolean): Record<string, unknown> {
  const p: Record<string, unknown> = {
    play: () => undefined,
    pause: () => undefined,
    replace: () => { mockLog.push('replace'); },
    seekTo: async () => undefined,
    setPlaybackRate: () => undefined,
    setActiveForLockScreen: () => undefined,
    updateLockScreenMetadata: () => undefined,
    remove: () => undefined,
    addListener: () => ({ remove: () => undefined }),
  };
  if (withSkipSilence) {
    let value = false;
    Object.defineProperty(p, 'skipSilence', {
      enumerable: true,
      get: () => value,
      set: (on: boolean) => { value = on; mockLog.push(`skip:${on}`); },
    });
  }
  return p;
}

describe('another app\'s short sound', () => {
  it('the choice reaches the native side before every audio mode', async () => {
    const adapter = createExpoAudioAdapter(() => fakePlayer(true) as never);
    await adapter.configure();
    await adapter.execute({ kind: 'setPauseOnPrompts', on: true });
    await voiceSessionOn();
    await voiceSessionOff();
    await adapter.execute({ kind: 'setPauseOnPrompts', on: false });
    expect(mockLog).toEqual([
      'native:false', 'mode:player',
      'native:true', 'mode:player',
      'native:true', 'mode:record',
      'native:true', 'mode:player',
      'native:false', 'mode:player',
    ]);
  });

  it('a build without the patched function keeps the library\'s own behaviour', async () => {
    mockNative = {};
    const adapter = createExpoAudioAdapter(() => fakePlayer(true) as never);
    await adapter.execute({ kind: 'setPauseOnPrompts', on: true });
    mockNative = { setPauseOnPrompts: 'not a function' };
    await adapter.configure();
    await adapter.execute({ kind: 'setPauseOnPrompts', on: false });
    expect(mockLog).toEqual(['mode:player', 'mode:player', 'mode:player']);
  });

  it('a build with no ExpoAudio module at all still sets the mode', async () => {
    mockNative = null;
    await createExpoAudioAdapter(() => fakePlayer(true) as never).configure();
    expect(mockLog).toEqual(['mode:player']);
  });
});

describe('skip silence', () => {
  it('is set on the player, and set again after each load only while it is on', async () => {
    const player = fakePlayer(true);
    const adapter = createExpoAudioAdapter(() => player as never);
    await adapter.execute({ kind: 'load', url: 'https://cdn.example.com/0.mp3', startMs: 0 });
    await adapter.execute({ kind: 'setSkipSilence', on: true });
    await adapter.execute({ kind: 'load', url: 'https://cdn.example.com/1.mp3', startMs: 0 });
    await adapter.execute({ kind: 'setSkipSilence', on: false });
    await adapter.execute({ kind: 'load', url: 'https://cdn.example.com/2.mp3', startMs: 0 });
    expect(mockLog).toEqual(['replace', 'skip:true', 'replace', 'skip:true', 'skip:false', 'replace']);
    expect(player['skipSilence']).toBe(false);
  });

  it('a player without the patched property is left alone', async () => {
    const player = fakePlayer(false);
    const adapter = createExpoAudioAdapter(() => player as never);
    await adapter.execute({ kind: 'setSkipSilence', on: true });
    await adapter.execute({ kind: 'load', url: 'https://cdn.example.com/1.mp3', startMs: 0 });
    expect('skipSilence' in player).toBe(false);
    expect(mockLog).toEqual(['replace']);
  });
});

describe('store', () => {
  it('sends the skip-silence and short-sound choices to the adapter', () => {
    const executed: Effect[] = [];
    const adapter: AudioAdapter = {
      execute: async (e) => { executed.push(e); },
      subscribe: (_l: (e: AdapterEvent) => void) => () => undefined,
      configure: async () => undefined,
      release: () => undefined,
    };
    const r = createPlayerRuntime({ adapter, stores: createMemoryStores(hash), now: () => 1_000, notify: () => undefined });
    r.setSkipSilence(true);
    r.setPauseOnPrompts(true);
    expect(executed.filter((e) => e.kind === 'setSkipSilence' || e.kind === 'setPauseOnPrompts')).toEqual([
      { kind: 'setSkipSilence', on: true },
      { kind: 'setPauseOnPrompts', on: true },
    ]);
  });
});
