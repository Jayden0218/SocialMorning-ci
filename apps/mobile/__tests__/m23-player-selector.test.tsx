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
  livePositionMs,
  type PlayableEpisode,
  type PlayerRuntime,
} from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';
import type { PlayerState } from '@/playback/types';

describe('the slices (every branch: src/playback keeps 100 % branch coverage)', () => {
  const idle: PlayerState = { kind: 'idle' };
  const playing: PlayerState = { kind: 'playing', episodeId: 'e1', positionMs: 5000, lastSavedMs: 0 };
  const buffering: PlayerState = { kind: 'buffering', episodeId: 'e1', positionMs: 6000, lastSavedMs: 0 };
  const paused: PlayerState = { kind: 'paused', episodeId: 'e1', positionMs: 7000, by: 'user' };
  const ended: PlayerState = { kind: 'ended', episodeId: 'e1' };
  const failed: PlayerState = { kind: 'error', message: 'x' };

  it('episodePlayView: loaded, playing and the paused position, for this episode only', () => {
    expect(episodePlayView(playing, undefined)).toEqual({ loaded: false, playing: false, positionMs: undefined });
    expect(episodePlayView(idle, 'e1')).toEqual({ loaded: false, playing: false, positionMs: undefined });
    expect(episodePlayView(playing, 'e2')).toEqual({ loaded: false, playing: false, positionMs: undefined });
    expect(episodePlayView(playing, 'e1')).toEqual({ loaded: true, playing: true, positionMs: undefined });
    expect(episodePlayView(buffering, 'e1')).toEqual({ loaded: true, playing: true, positionMs: undefined });
    expect(episodePlayView(paused, 'e1')).toEqual({ loaded: true, playing: false, positionMs: 7000 });
    expect(episodePlayView(ended, 'e1')).toEqual({ loaded: true, playing: false, positionMs: undefined });
    expect(episodePlayView(failed, 'e1')).toEqual({ loaded: false, playing: false, positionMs: undefined });
  });

  it('sameEpisodePlayView compares every field', () => {
    const v = { loaded: true, playing: false, positionMs: 1 };
    expect(sameEpisodePlayView(v, { ...v })).toBe(true);
    expect(sameEpisodePlayView(v, { ...v, loaded: false })).toBe(false);
    expect(sameEpisodePlayView(v, { ...v, playing: true })).toBe(false);
    expect(sameEpisodePlayView(v, { ...v, positionMs: 2 })).toBe(false);
  });

  it('livePositionMs reads the position now, for this episode only', () => {
    const at = (s: PlayerState) => ({ getState: () => s }) as unknown as PlayerRuntime;
    expect(livePositionMs(at(playing), undefined)).toBeUndefined();
    expect(livePositionMs(at(idle), 'e1')).toBeUndefined();
    expect(livePositionMs(at(playing), 'e2')).toBeUndefined();
    expect(livePositionMs(at(ended), 'e1')).toBeUndefined();
    expect(livePositionMs(at(playing), 'e1')).toBe(5000);
    const noPosition = { kind: 'error', episodeId: 'e1', message: 'x', positionMs: undefined } as unknown as PlayerState;
    expect(livePositionMs(at(noPosition), 'e1')).toBeUndefined();
    expect(episodePlayView(noPosition, 'e1')).toEqual({ loaded: true, playing: false, positionMs: undefined });
  });

  it('a new selector (a prop changed, the player did not) is applied on the next render', () => {
    const { runtime } = harness();
    function Pick(props: { id: string }): React.ReactElement {
      return createElement(Text, null, usePlayerSelector((s) => `${props.id}:${s.kind}`));
    }
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(createElement(PlayerProvider, { runtime }, createElement(Pick, { id: 'a' }))); });
    expect(tree.toJSON()).toMatchObject({ children: ['a:idle'] });
    act(() => { tree.update(createElement(PlayerProvider, { runtime }, createElement(Pick, { id: 'b' }))); });
    expect(tree.toJSON()).toMatchObject({ children: ['b:idle'] });
  });
});

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

// Kept as a source check: a rule over four expo-router pages (the root layout and three of the
// heaviest screens, each pulling in the social API, stores, sheets and the router); the render
// counts above prove the selector itself, this proves the pages use it.
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
