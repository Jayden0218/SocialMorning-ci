/**
 * M2 sleep timer (FR-015..017) and speed memory (FR-013) in the runtime, with fake
 * timers. What this proves: the rules. What it does not: that a JS timer fires on a
 * locked phone — quickstart D3.
 */
import { createPlayerRuntime, type PlayableEpisode } from '../src/playback/store';
import type { AdapterEvent, AudioAdapter } from '../src/playback/expo-audio-adapter';
import type { Effect } from '../src/playback/types';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';

jest.useFakeTimers();

function fakeAdapter(): { adapter: AudioAdapter; executed: Effect[]; push: (e: AdapterEvent) => void } {
  const executed: Effect[] = [];
  let handler: ((e: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = {
    execute: async (effect: Effect) => void executed.push(effect),
    subscribe(l: (e: AdapterEvent) => void) { handler = l; return () => { handler = undefined; }; },
    configure: async () => undefined,
    release: () => undefined,
  };
  return { adapter, executed, push: (e) => handler?.(e) };
}

const ep = (id: string, feedUrl = 'https://f/a.xml'): PlayableEpisode => ({ id, url: `https://cdn/${id}.mp3`, title: id, showTitle: 'S', durationMs: 3_600_000, feedUrl });

function build() {
  const stores = createMemoryStores(hash);
  const fake = fakeAdapter();
  let clock = 1_000_000;
  const runtime = createPlayerRuntime({
    adapter: fake.adapter, stores, now: () => clock, notify: () => {},
    advance: { lookup: ep, online: () => true },
  });
  const kinds = () => fake.executed.map((e) => e.kind);
  const tick = (ms: number) => { clock += ms; jest.advanceTimersByTime(ms); };
  const start = (id = 'a') => { runtime.load(ep(id), 'play'); fake.push({ type: 'LOADED', durationMs: 3_600_000 }); };
  return { stores, fake, runtime, kinds, tick, start };
}

it('a 5-minute timer pauses at its deadline, keeps the position, and Play afterwards clears it', () => {
  const { fake, runtime, kinds, tick, start } = build();
  start();
  runtime.setSleepTimer(5);
  expect(runtime.sleepRemainingMs()).toBe(300_000);
  fake.push({ type: 'TICK', positionMs: 100_000, durationMs: 3_600_000 });
  tick(299_999);
  expect(kinds()).not.toContain('pause');
  tick(1);
  expect(kinds()).toContain('pause');
  expect(runtime.getState()).toMatchObject({ kind: 'paused', positionMs: 100_000 });
  expect(runtime.sleepTimer()).toEqual({ kind: 'off' });
  runtime.play();
  expect(runtime.getState().kind).toBe('playing');
  expect(runtime.sleepTimer()).toEqual({ kind: 'off' });
});

it('FR-017: a call during the timer neither fires nor resets it; changing it replaces it; cancelling clears it', () => {
  const { fake, runtime, kinds, tick, start } = build();
  start();
  runtime.setSleepTimer(10);
  tick(120_000);
  fake.push({ type: 'EXTERNAL_PAUSE', at: 120_000 });
  expect(runtime.getState().kind).toBe('yielded');
  fake.push({ type: 'EXTERNAL_RESUME' });
  expect(runtime.sleepRemainingMs()).toBe(480_000);
  runtime.setSleepTimer(15);
  expect(runtime.sleepRemainingMs()).toBe(900_000);
  runtime.setSleepTimer('off');
  tick(1_000_000);
  expect(kinds().filter((k) => k === 'pause')).toHaveLength(0);
});

it('FR-016: "end of episode" stops at the end, the queue is untouched, and a new load clears the flag', () => {
  const { stores, fake, runtime, start } = build();
  stores.queue.replace(['b'], 1);
  start();
  runtime.setSleepTimer('endOfEpisode');
  expect(runtime.sleepRemainingMs()).toBeUndefined();
  fake.push({ type: 'ENDED' });
  expect(runtime.getState().kind).toBe('ended');
  expect(stores.queue.list()).toEqual(['b']);
  start('c');
  expect(runtime.sleepTimer()).toEqual({ kind: 'off' });
  fake.push({ type: 'ENDED' });
  expect(stores.queue.list()).toEqual([]);
});

it('APP_FOREGROUND re-arms the timer with the remaining time (a drifted background timer still fires)', () => {
  const { runtime, kinds, tick, start } = build();
  start();
  runtime.setSleepTimer(5);
  tick(200_000);
  runtime.dispose(); // simulate the JS timer being lost; the runtime is then told the app came back
  const again = build();
  again.start();
  again.runtime.setSleepTimer(5);
  again.tick(100_000);
  again.fake.push({ type: 'APP_BACKGROUND' });
  again.tick(150_000);
  again.fake.push({ type: 'APP_FOREGROUND' });
  again.tick(50_000);
  expect(again.kinds()).toContain('pause');
  void kinds;
});

it('D3 regression: with JS timers dead (locked screen), the next TICK past the deadline pauses', () => {
  const stores = createMemoryStores(hash);
  const fake = fakeAdapter();
  let now = 1_000_000;
  const runtime = createPlayerRuntime({ adapter: fake.adapter, stores, now: () => now, notify: () => {} });
  runtime.load(ep('a'), 'play');
  fake.push({ type: 'LOADED', durationMs: 3_600_000 });
  runtime.setSleepTimer(5);
  // The wall clock moves; jest's fake timers are NOT advanced — as on the phone, where the
  // setTimeout never fired. Only native ticks arrive.
  now += 299_000;
  fake.push({ type: 'TICK', positionMs: 299_000, durationMs: 3_600_000 });
  expect(fake.executed.map((e) => e.kind)).not.toContain('pause');
  now += 1_500;
  fake.push({ type: 'TICK', positionMs: 300_500, durationMs: 3_600_000 });
  expect(fake.executed.map((e) => e.kind)).toContain('pause');
  expect(runtime.getState()).toMatchObject({ kind: 'paused', positionMs: 299_000 });
  expect(runtime.sleepTimer()).toEqual({ kind: 'off' });
});

// FR-013 (quickstart's speed-memory test)
it('speed memory: show A at 1.5 → show B at the default → back to A at 1.5; the default applies where no pref exists', () => {
  const { stores, fake, runtime, start } = build();
  const rates = () => fake.executed.filter((e): e is Extract<Effect, { kind: 'setRate' }> => e.kind === 'setRate').map((e) => e.rate);
  start('a');
  runtime.setRate(1.5);
  expect(stores.speed.get('https://f/a.xml')).toBe(1.5);
  runtime.load(ep('b', 'https://f/b.xml'), 'play');
  fake.push({ type: 'LOADED', durationMs: 1 });
  expect(runtime.rate()).toBe(1);
  runtime.load(ep('a2', 'https://f/a.xml'), 'play');
  fake.push({ type: 'LOADED', durationMs: 1 });
  expect(runtime.rate()).toBe(1.5);
  runtime.setDefaultRate(1.2);
  runtime.load(ep('b2', 'https://f/b.xml'), 'play');
  fake.push({ type: 'LOADED', durationMs: 1 });
  expect(runtime.rate()).toBe(1.2);
  expect(rates().at(-1)).toBe(1.2);
  runtime.setRate(9);
  expect(runtime.rate()).toBe(3);
});
