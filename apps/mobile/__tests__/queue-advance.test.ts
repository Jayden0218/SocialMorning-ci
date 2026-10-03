/**
 * quickstart A10: the runtime consumes the queue on `ended` — and only then.
 * Fake adapter (as store.test.ts); memory stores; no device.
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

const ep = (id: string): PlayableEpisode => ({ id, url: `https://cdn/${id}.mp3`, title: id, showTitle: 'S', durationMs: 60_000 });

function build(online = true) {
  const stores = createMemoryStores(hash);
  const fake = fakeAdapter();
  const skipped: string[] = [];
  const runtime = createPlayerRuntime({
    adapter: fake.adapter, stores, now: () => 1, notify: () => {},
    advance: { lookup: ep, online: () => online, onSkipped: (id) => skipped.push(id) },
  });
  const loads = () => fake.executed.filter((e): e is Extract<Effect, { kind: 'load' }> => e.kind === 'load').map((e) => e.url);
  return { stores, fake, runtime, skipped, loads };
}

it('A10: when the current episode ends, the first queued item is loaded with intent play and leaves the queue', () => {
  const { stores, fake, runtime, loads } = build();
  stores.queue.replace(['b', 'c'], 1);
  runtime.load(ep('a'), 'play');
  fake.push({ type: 'LOADED', durationMs: 60_000 });
  fake.push({ type: 'ENDED' });
  expect(loads()).toEqual(['https://cdn/a.mp3', 'https://cdn/b.mp3']);
  expect(stores.queue.list()).toEqual(['c']);
  expect(runtime.getState().kind).toBe('loading');
});

it('A10: an empty queue starts nothing; a direct load never touches the queue (Q1)', () => {
  const { stores, fake, runtime, loads } = build();
  runtime.load(ep('a'), 'play');
  fake.push({ type: 'LOADED', durationMs: 60_000 });
  fake.push({ type: 'ENDED' });
  expect(loads()).toEqual(['https://cdn/a.mp3']);
  expect(runtime.getState().kind).toBe('ended');
  stores.queue.replace(['q1', 'q2'], 1);
  runtime.load(ep('direct'), 'play');
  expect(stores.queue.list()).toEqual(['q1', 'q2']);
});

it('A10: offline, undownloaded items are skipped (reported, kept) and the first downloaded one plays', () => {
  const { stores, fake, runtime, loads, skipped } = build(false);
  stores.queue.replace(['u', 'd', 'x'], 1);
  stores.downloads.put({ episodeId: 'd', filePath: 'file:///d.mp3', state: 'complete', bytesDone: 1, bytesTotal: 1, allowMobile: false, requestedAt: 1 });
  runtime.load(ep('a'), 'play');
  fake.push({ type: 'LOADED', durationMs: 60_000 });
  fake.push({ type: 'ENDED' });
  expect(loads()[1]).toBe('https://cdn/d.mp3');
  expect(skipped).toEqual(['u']);
  expect(stores.queue.list()).toEqual(['u', 'x']);
});

it('FR-016: holdNextAdvance(true) makes the next ended stop without touching the queue, once', () => {
  const { stores, fake, runtime, loads } = build();
  stores.queue.replace(['b'], 1);
  runtime.holdNextAdvance(true);
  runtime.load(ep('a'), 'play');
  fake.push({ type: 'LOADED', durationMs: 60_000 });
  fake.push({ type: 'ENDED' });
  expect(loads()).toEqual(['https://cdn/a.mp3']);
  expect(stores.queue.list()).toEqual(['b']);
  runtime.load(ep('a2'), 'play');
  fake.push({ type: 'LOADED', durationMs: 60_000 });
  fake.push({ type: 'ENDED' });
  expect(loads()).toEqual(['https://cdn/a.mp3', 'https://cdn/a2.mp3', 'https://cdn/b.mp3']);
});

it('a queued id the feed no longer knows is dropped and the queue keeps going', () => {
  const stores = createMemoryStores(hash);
  const fake = fakeAdapter();
  const runtime = createPlayerRuntime({
    adapter: fake.adapter, stores, now: () => 1, notify: () => {},
    advance: { lookup: (id) => (id === 'gone' ? undefined : ep(id)), online: () => true },
  });
  stores.queue.replace(['gone', 'b'], 1);
  runtime.load(ep('a'), 'play');
  fake.push({ type: 'LOADED', durationMs: 60_000 });
  fake.push({ type: 'ENDED' });
  expect(stores.queue.list()).toEqual([]);
  expect(fake.executed.filter((e) => e.kind === 'load')).toHaveLength(2);
});
