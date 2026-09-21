/**
 * M4 runtime clip mode (T011, FR-003, research R7): load → explicit seek to the start on
 * LOADED → pause once at the end on a TICK → "keep listening" is a plain Play. And the
 * TICK hook the listened accumulator uses (R3). No jest timers involved: the end is a
 * TICK fact, like M2's sleep timer after D3.
 */
import { createPlayerRuntime, type PlayableEpisode } from '../src/playback/store';
import type { AdapterEvent, AudioAdapter } from '../src/playback/expo-audio-adapter';
import type { Effect } from '../src/playback/types';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';

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

const ep = (id: string): PlayableEpisode => ({ id, url: `https://cdn/${id}.mp3`, title: id, showTitle: 'S', durationMs: 3_600_000, feedUrl: 'https://f/a.xml' });

function build() {
  const stores = createMemoryStores(hash);
  const fake = fakeAdapter();
  const ticks: [string, number][] = [];
  const runtime = createPlayerRuntime({ adapter: fake.adapter, stores, now: () => 1, notify: () => {}, onTick: (e, p) => { ticks.push([e, p]); } });
  const kinds = () => fake.executed.map((e) => e.kind);
  return { stores, fake, runtime, kinds, ticks };
}

it('playClip: loads, seeks to the start once loaded (an explicit seek), pauses once at the end, Play continues', () => {
  const { fake, runtime, kinds, stores } = build();
  runtime.playClip(ep('a'), { startMs: 872_000, endMs: 910_000 });
  expect(runtime.clip()).toEqual({ episodeId: 'a', startMs: 872_000, endMs: 910_000 });
  expect(kinds()).toEqual(['load']);
  fake.push({ type: 'LOADED', durationMs: 3_600_000 });
  expect(kinds()).toContain('seek');
  expect(fake.executed.find((e) => e.kind === 'seek')).toMatchObject({ toMs: 872_000 });
  expect(stores.positions.get('a')).toMatchObject({ offsetMs: 872_000, explicitSeek: true });
  expect(runtime.clip()).toBeDefined(); // our own seek does not leave clip mode
  fake.push({ type: 'TICK', positionMs: 900_000, durationMs: 3_600_000 });
  expect(kinds()).not.toContain('pause');
  fake.push({ type: 'TICK', positionMs: 910_000, durationMs: 3_600_000 });
  expect(kinds().filter((k) => k === 'pause')).toHaveLength(1);
  expect(runtime.getState()).toMatchObject({ kind: 'paused', positionMs: 900_000 });
  expect(runtime.clip()).toBeUndefined();
  runtime.play();
  fake.push({ type: 'TICK', positionMs: 950_000, durationMs: 3_600_000 });
  expect(kinds().filter((k) => k === 'pause')).toHaveLength(1); // no second pause after keep listening
});

it('G5 on build 7: the load starts at the clip start, and a stale TICK past the end before the range is reached does not pause', () => {
  const { fake, runtime, kinds, stores } = build();
  stores.positions.save({ episodeId: 'a', offsetMs: 2_300_234, finished: false }, 1); // the saved position, past the clip
  runtime.playClip(ep('a'), { startMs: 2_184_027, endMs: 2_214_027 });
  expect(fake.executed.find((e) => e.kind === 'load')).toMatchObject({ startMs: 2_184_027 });
  fake.push({ type: 'LOADED', durationMs: 3_600_000 });
  fake.push({ type: 'TICK', positionMs: 2_300_234, durationMs: 3_600_000 }); // the old position, reported once
  expect(kinds()).not.toContain('pause');
  expect(runtime.clip()).toBeDefined();
  fake.push({ type: 'TICK', positionMs: 2_184_100, durationMs: 3_600_000 }); // inside the range: armed
  fake.push({ type: 'TICK', positionMs: 2_214_100, durationMs: 3_600_000 });
  expect(kinds().filter((k) => k === 'pause')).toHaveLength(1);
  expect(runtime.clip()).toBeUndefined();
});

it('a seek, a skip or another load leaves clip mode; a LOADED for a different load does not seek', () => {
  const { fake, runtime, kinds } = build();
  runtime.playClip(ep('a'), { startMs: 10_000, endMs: 20_000 });
  runtime.seek(5_000);
  expect(runtime.clip()).toBeUndefined();
  runtime.playClip(ep('b'), { startMs: 10_000, endMs: 20_000 });
  runtime.skip(30_000);
  expect(runtime.clip()).toBeUndefined();
  runtime.playClip(ep('c'), { startMs: 10_000, endMs: 20_000 });
  runtime.load(ep('d'), 'play');
  expect(runtime.clip()).toBeUndefined();
  const seeks = kinds().filter((k) => k === 'seek').length;
  fake.push({ type: 'LOADED', durationMs: 100 }); // this is d's load; c's pending seek was abandoned with c
  expect(kinds().filter((k) => k === 'seek').length).toBe(seeks);
});

it('onTick reports the current episode and position on every TICK while something is loaded', () => {
  const { fake, runtime, ticks } = build();
  fake.push({ type: 'TICK', positionMs: 1, durationMs: 1 }); // idle: nothing loaded, nothing reported
  runtime.load(ep('a'), 'play');
  fake.push({ type: 'LOADED', durationMs: 3_600_000 });
  fake.push({ type: 'TICK', positionMs: 1_000, durationMs: 3_600_000 });
  fake.push({ type: 'TICK', positionMs: 2_000, durationMs: 3_600_000 });
  expect(ticks).toEqual([['a', 1_000], ['a', 2_000]]);
});

it('M4 gap 2: after the clip-end pause, a lock-screen Play (EXTERNAL_RESUME) puts the runtime back in playing and ticks count again', () => {
  const { fake, runtime, ticks } = build();
  runtime.playClip(ep('a'), { startMs: 10_000, endMs: 20_000 });
  fake.push({ type: 'LOADED', durationMs: 3_600_000 });
  fake.push({ type: 'TICK', positionMs: 11_000, durationMs: 3_600_000 });
  fake.push({ type: 'TICK', positionMs: 20_000, durationMs: 3_600_000 });
  expect(runtime.getState().kind).toBe('paused');
  fake.push({ type: 'EXTERNAL_RESUME' });
  expect(runtime.getState().kind).toBe('playing');
  fake.push({ type: 'TICK', positionMs: 21_000, durationMs: 3_600_000 });
  expect(runtime.getState()).toMatchObject({ kind: 'playing', positionMs: 21_000 });
  expect(ticks.at(-1)).toEqual(['a', 21_000]);
});
