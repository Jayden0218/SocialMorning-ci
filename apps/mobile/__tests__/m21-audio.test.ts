// Tests voice boost and "Play with other apps": what reaches the native side, and when the rows show.
/**
 * M21 US11 (owner, G0 2026-10-06; research R2 + R4). Every new branch in src/playback (held at
 * 100 % branches):
 *   - adapter: `setVoiceBoost` sets `player.voiceBoost` only on a player that has it (our M21
 *     patch), and sets it again after every load while it is on (not while it is off);
 *   - adapter: "Play with other apps" makes every player audio mode — configure, the effect and
 *     voiceSessionOff — `mixWithOthers`; off puts `doNotMix` back;
 *   - store: `setVoiceBoost` / `setMixWithOthers` send their effects.
 * And the pure rules in src/settings/audio.ts: voice boost needs Android 9 (API 28); on iPhone an
 * HLS stream greys out boost and skip silence (the audio tap gets no buffers there).
 *
 * The break that turns it red: in src/playback/expo-audio-adapter.ts change
 * `interruptionMode: mixWithOthers ? 'mixWithOthers' : 'doNotMix'` to always 'doNotMix'
 * (the mix test fails), or drop `if (voiceBoost) applyVoiceBoost();` (the load test fails).
 *
 * A mock tests the translation, not the phone: whether speech sounds clearer, and whether two
 * apps are heard together, is NOT VERIFIED until quickstart B16/B17.
 */
import { createExpoAudioAdapter, voiceSessionOff } from '@/playback/expo-audio-adapter';
import { createPlayerRuntime } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import { effectsBlocked, isHlsUrl, voiceBoostSupported } from '@/settings/audio';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';
import type { Effect } from '@/playback/types';

const mockLog: string[] = [];

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async (mode: { interruptionMode?: string; allowsRecording?: boolean }) => {
    mockLog.push(`mode:${mode.interruptionMode ?? '-'}${mode.allowsRecording === false ? ':off' : ''}`);
  }),
}));

jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

beforeEach(() => { mockLog.length = 0; });

function fakePlayer(withVoiceBoost: boolean): Record<string, unknown> {
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
  if (withVoiceBoost) {
    let value = false;
    Object.defineProperty(p, 'voiceBoost', {
      enumerable: true,
      get: () => value,
      set: (on: boolean) => { value = on; mockLog.push(`boost:${on}`); },
    });
  }
  return p;
}

describe('voice boost', () => {
  it('is set on the player, and set again after each load only while it is on', async () => {
    const player = fakePlayer(true);
    const adapter = createExpoAudioAdapter(() => player as never);
    await adapter.execute({ kind: 'load', url: 'https://cdn.example.com/0.mp3', startMs: 0 });
    await adapter.execute({ kind: 'setVoiceBoost', on: true });
    await adapter.execute({ kind: 'load', url: 'https://cdn.example.com/1.mp3', startMs: 0 });
    await adapter.execute({ kind: 'setVoiceBoost', on: false });
    await adapter.execute({ kind: 'load', url: 'https://cdn.example.com/2.mp3', startMs: 0 });
    expect(mockLog).toEqual(['replace', 'boost:true', 'replace', 'boost:true', 'boost:false', 'replace']);
    expect(player['voiceBoost']).toBe(false);
  });

  it('a player without the patched property is left alone', async () => {
    const player = fakePlayer(false);
    const adapter = createExpoAudioAdapter(() => player as never);
    await adapter.execute({ kind: 'setVoiceBoost', on: true });
    await adapter.execute({ kind: 'load', url: 'https://cdn.example.com/1.mp3', startMs: 0 });
    expect('voiceBoost' in player).toBe(false);
    expect(mockLog).toEqual(['replace']);
  });
});

describe('play with other apps', () => {
  it('off by default; on makes every player mode mixWithOthers; off puts doNotMix back', async () => {
    const adapter = createExpoAudioAdapter(() => fakePlayer(false) as never);
    await adapter.configure();
    await adapter.execute({ kind: 'setMixWithOthers', on: true });
    await adapter.configure();
    await voiceSessionOff();
    await adapter.execute({ kind: 'setMixWithOthers', on: false });
    await voiceSessionOff();
    expect(mockLog).toEqual([
      'mode:doNotMix',
      'mode:mixWithOthers',
      'mode:mixWithOthers',
      'mode:mixWithOthers:off',
      'mode:doNotMix',
      'mode:doNotMix:off',
    ]);
  });
});

describe('store', () => {
  it('sends the voice-boost and mix choices to the adapter', () => {
    const executed: Effect[] = [];
    const adapter: AudioAdapter = {
      execute: async (e) => { executed.push(e); },
      subscribe: (_l: (e: AdapterEvent) => void) => () => undefined,
      configure: async () => undefined,
      release: () => undefined,
    };
    const r = createPlayerRuntime({ adapter, stores: createMemoryStores(hash), now: () => 1_000, notify: () => undefined });
    r.setVoiceBoost(true);
    r.setMixWithOthers(true);
    r.setVoiceBoost(false);
    expect(executed.filter((e) => e.kind === 'setVoiceBoost' || e.kind === 'setMixWithOthers')).toEqual([
      { kind: 'setVoiceBoost', on: true },
      { kind: 'setMixWithOthers', on: true },
      { kind: 'setVoiceBoost', on: false },
    ]);
  });
});

describe('when the rows apply (src/settings/audio.ts)', () => {
  it('voice boost needs Android 9 (API 28); iPhone always has it', () => {
    expect(voiceBoostSupported('android', 27)).toBe(false);
    expect(voiceBoostSupported('android', 28)).toBe(true);
    expect(voiceBoostSupported('android', '34')).toBe(true);
    expect(voiceBoostSupported('ios', '17.0')).toBe(true);
    expect(voiceBoostSupported('web', 0)).toBe(false);
  });

  it('an HLS address is told apart by its .m3u8 path, query or not', () => {
    expect(isHlsUrl('https://cdn.example.com/live/index.m3u8')).toBe(true);
    expect(isHlsUrl('https://cdn.example.com/live/INDEX.M3U8?token=1')).toBe(true);
    expect(isHlsUrl('https://cdn.example.com/ep.mp3')).toBe(false);
    expect(isHlsUrl('https://cdn.example.com/ep.mp3?f=x.m3u8')).toBe(false);
    expect(isHlsUrl(undefined)).toBe(false);
  });

  it('on iPhone an HLS episode greys out boost and skip silence; Android never does', () => {
    expect(effectsBlocked('ios', 'https://cdn.example.com/a.m3u8')).toBe(true);
    expect(effectsBlocked('ios', 'https://cdn.example.com/a.mp3')).toBe(false);
    expect(effectsBlocked('android', 'https://cdn.example.com/a.m3u8')).toBe(false);
  });
});
