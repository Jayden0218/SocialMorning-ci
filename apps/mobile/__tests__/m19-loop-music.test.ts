// Tests "Loop this episode" and music mode: what the store asks for, and what reaches the player.
/**
 * M19 T070 (US7, research R2 + R4). Every new branch in src/playback (held at 100 % branches):
 *   - adapter: `setLoop` sets `player.loop`; `setPitch` changes what the next `setRate` sets as
 *     `shouldCorrectPitch` (true until music mode is on);
 *   - store: `setLoop` / `loop()`; a load turns a loop off (and only then tells the adapter);
 *     `setMusicMode` sends the pitch choice and re-applies the rate in force.
 *
 * The break that turns it red: in src/playback/expo-audio-adapter.ts drop the line
 * `player.loop = effect.on;` (the first test fails).
 */
import { createExpoAudioAdapter } from '@/playback/expo-audio-adapter';
import { createPlayerRuntime, type PlayableEpisode } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';
import type { Effect } from '@/playback/types';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

type FakePlayer = { loop?: boolean; shouldCorrectPitch?: boolean; rates: { rate: number; pitch: boolean | undefined }[] };

function fakePlayer(): FakePlayer & Record<string, unknown> {
  const p: FakePlayer & Record<string, unknown> = {
    rates: [],
    play: () => undefined,
    pause: () => undefined,
    replace: () => undefined,
    seekTo: async () => undefined,
    setActiveForLockScreen: () => undefined,
    updateLockScreenMetadata: () => undefined,
    remove: () => undefined,
    addListener: () => ({ remove: () => undefined }),
  };
  p['setPlaybackRate'] = (rate: number) => { p.rates.push({ rate, pitch: p.shouldCorrectPitch }); };
  return p;
}

describe('adapter', () => {
  it('setLoop sets the player\'s loop, on and off', async () => {
    const player = fakePlayer();
    const adapter = createExpoAudioAdapter(() => player as never);
    await adapter.execute({ kind: 'setLoop', on: true });
    expect(player.loop).toBe(true);
    await adapter.execute({ kind: 'setLoop', on: false });
    expect(player.loop).toBe(false);
  });

  it('pitch correction is on for every rate until music mode turns it off, and back', async () => {
    const player = fakePlayer();
    const adapter = createExpoAudioAdapter(() => player as never);
    await adapter.execute({ kind: 'setRate', rate: 1.5 });
    await adapter.execute({ kind: 'setPitch', correct: false });
    await adapter.execute({ kind: 'setRate', rate: 1.5 });
    await adapter.execute({ kind: 'setPitch', correct: true });
    await adapter.execute({ kind: 'setRate', rate: 1.2 });
    expect(player.rates).toEqual([
      { rate: 1.5, pitch: true },
      { rate: 1.5, pitch: false },
      { rate: 1.2, pitch: true },
    ]);
  });
});

const EP: PlayableEpisode = { id: 'e1', url: 'https://cdn.example.com/1.mp3', title: 'One', showTitle: 'Show', durationMs: 600_000 };
const EP2: PlayableEpisode = { id: 'e2', url: 'https://cdn.example.com/2.mp3', title: 'Two', showTitle: 'Show', durationMs: 600_000 };

function runtime() {
  const executed: Effect[] = [];
  const adapter: AudioAdapter = {
    execute: async (e) => { executed.push(e); },
    subscribe: (_l: (e: AdapterEvent) => void) => () => undefined,
    configure: async () => undefined,
    release: () => undefined,
  };
  const r = createPlayerRuntime({ adapter, stores: createMemoryStores(hash), now: () => 1_000, notify: () => undefined });
  return { r, executed };
}

const loops = (es: Effect[]) => es.filter((e): e is Extract<Effect, { kind: 'setLoop' }> => e.kind === 'setLoop').map((e) => e.on);

describe('store', () => {
  it('setLoop tells the adapter, loop() reports it, and listeners hear of it', () => {
    const { r, executed } = runtime();
    const heard = jest.fn();
    r.subscribe(heard);
    expect(r.loop()).toBe(false);
    r.setLoop(true);
    expect(r.loop()).toBe(true);
    expect(loops(executed)).toEqual([true]);
    expect(heard).toHaveBeenCalled();
  });

  it('a load turns a loop off; a load with no loop sends nothing about looping', () => {
    const { r, executed } = runtime();
    r.load(EP, 'pause');
    expect(loops(executed)).toEqual([]);
    r.setLoop(true);
    r.load(EP2, 'pause');
    expect(r.loop()).toBe(false);
    expect(loops(executed)).toEqual([true, false]);
  });

  it('music mode sends the pitch choice, then the rate in force', () => {
    const { r, executed } = runtime();
    r.setMusicMode(true);
    r.setMusicMode(false);
    const tail = executed.filter((e) => e.kind === 'setPitch' || e.kind === 'setRate');
    expect(tail).toEqual([
      { kind: 'setPitch', correct: false },
      { kind: 'setRate', rate: r.rate() },
      { kind: 'setPitch', correct: true },
      { kind: 'setRate', rate: r.rate() },
    ]);
  });
});
