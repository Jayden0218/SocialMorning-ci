// Tests that a position tick does not re-render a screen that reads only part of the player.
/**
 * G-M23-8 (M23 US7, FR-012): the root layout, the show page, the episode page and the comments
 * page used `usePlayerState()`, so every position TICK re-rendered all of them. They now read a
 * slice through `usePlayerSelector`. These render counts are the guard.
 *
 * The break that turns this red: in `src/playback/store.ts` `usePlayerSelector`, return
 * `useSyncExternalStore(runtime.subscribe, runtime.getState, …)`-style fresh values (drop the
 * `eq(prev.value, next) ? prev.value : next` line, use `const value = next`) with an object
 * selector — or make the layout call `usePlayerState()` again.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  PlayerProvider,
  createPlayerRuntime,
  episodePlayView,
  sameEpisodePlayView,
  usePlayerSelector,
  usePlayerState,
  type PlayableEpisode,
  type PlayerRuntime,
} from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';

const EPISODE: PlayableEpisode = { id: 'e1', url: 'https://cdn.example.com/1.mp3', title: 'Episode 1', showTitle: 'A Show' };

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

function mount(runtime: PlayerRuntime, child: React.ReactElement): ReturnType<typeof create> {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(createElement(PlayerProvider, { runtime }, child)); });
  return tree;
}

function startPlaying(runtime: PlayerRuntime, push: (e: AdapterEvent) => void): void {
  act(() => { runtime.load(EPISODE, 'play'); });
  act(() => { push({ type: 'LOADED', durationMs: 600_000 }); });
}

it('a TICK does not re-render a component that selects only kind', () => {
  const { runtime, push } = harness();
  let renders = 0;
  function KindOnly(): React.ReactElement {
    renders += 1;
    return createElement(Text, null, usePlayerSelector((s) => s.kind));
  }
  const tree = mount(runtime, createElement(KindOnly));
  startPlaying(runtime, push);
  expect(tree.toJSON()).toMatchObject({ children: ['playing'] });
  const before = renders;
  for (let i = 1; i <= 20; i += 1) act(() => { push({ type: 'TICK', positionMs: i * 500 }); });
  expect(renders).toBe(before);
  act(() => { runtime.pause(); });
  expect(tree.toJSON()).toMatchObject({ children: ['paused'] });
  expect(renders).toBe(before + 1);
});

it('the episode page view (an object) does not re-render on a TICK while it plays', () => {
  const { runtime, push } = harness();
  let renders = 0;
  function EpisodePage(): React.ReactElement {
    renders += 1;
    const v = usePlayerSelector((s) => episodePlayView(s, 'e1'), sameEpisodePlayView);
    return createElement(Text, null, v.playing ? 'playing' : v.loaded ? `at ${v.positionMs ?? 0}` : 'off');
  }
  const tree = mount(runtime, createElement(EpisodePage));
  startPlaying(runtime, push);
  const before = renders;
  for (let i = 1; i <= 20; i += 1) act(() => { push({ type: 'TICK', positionMs: i * 500 }); });
  expect(renders).toBe(before);
  act(() => { runtime.pause(); });
  expect(tree.toJSON()).toMatchObject({ children: ['at 10000'] });
});

it('control: the whole state still re-renders per TICK (so the counts above mean something)', () => {
  const { runtime, push } = harness();
  let renders = 0;
  function Whole(): React.ReactElement {
    renders += 1;
    return createElement(Text, null, usePlayerState().kind);
  }
  mount(runtime, createElement(Whole));
  startPlaying(runtime, push);
  const before = renders;
  for (let i = 1; i <= 5; i += 1) act(() => { push({ type: 'TICK', positionMs: i * 500 }); });
  expect(renders).toBe(before + 5);
});

it('the four screens read the player through a selector, not the whole state', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  for (const f of ['app/_layout.tsx', 'app/show/[feedUrl].tsx', 'app/comments/[episodeId].tsx', 'app/episode/[id].tsx']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    expect({ f, whole: /usePlayerState\(/.test(src) }).toEqual({ f, whole: false });
    expect({ f, selector: /usePlayerSelector\(/.test(src) }).toEqual({ f, selector: true });
  }
});
