// Checks that pages using the player's status re-draw on play/pause/episode changes, not on every tick.
/**
 * The lag audit (2026-10-04): the player state changes about twice a second while audio plays,
 * and pages that only ask "is this episode playing?" re-drew with it. usePlayerSelect /
 * usePlayerStatus (src/playback/store.ts) re-render only when the selected value changes.
 *
 * The break that turns it red: make usePlayerStatus return usePlayerState() fields directly.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  PlayerProvider,
  createPlayerRuntime,
  playerStatusOf,
  usePlayerStatus,
  type PlayableEpisode,
  type PlayerRuntime,
} from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';

const EPISODE: PlayableEpisode = {
  id: 'e1',
  url: 'https://cdn.example.com/1.mp3',
  title: 'Episode 1',
  showTitle: 'A Show',
};

function harness(): { runtime: PlayerRuntime; push: (e: AdapterEvent) => void } {
  let listener: ((event: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = {
    execute: async () => undefined,
    subscribe: (l) => {
      listener = l;
      return () => undefined;
    },
    configure: async () => undefined,
    release: () => undefined,
  };
  const runtime = createPlayerRuntime({
    adapter,
    stores: createMemoryStores(hash),
    now: () => 1,
    notify: () => undefined,
  });
  return { runtime, push: (e) => listener?.(e) };
}

it('re-renders on play, pause and a new episode — not on position ticks', () => {
  const { runtime, push } = harness();
  let renders = 0;
  function Status(): React.ReactElement {
    renders += 1;
    const s = usePlayerStatus();
    return createElement(Text, null, `${s.kind}:${s.episodeId ?? '-'}`);
  }
  let tree: ReturnType<typeof create> | undefined;
  act(() => { tree = create(createElement(PlayerProvider, { runtime }, createElement(Status))); });
  expect(tree?.toJSON()).toMatchObject({ children: ['idle:-'] });

  act(() => { runtime.load(EPISODE, 'play'); });
  act(() => { push({ type: 'LOADED', durationMs: 60_000 }); });
  expect(tree?.toJSON()).toMatchObject({ children: ['playing:e1'] });
  const before = renders;
  act(() => { for (let ms = 500; ms <= 10_000; ms += 500) push({ type: 'TICK', positionMs: ms }); });
  expect(renders).toBe(before); // 20 ticks, no re-render
});

it('the status key: kind and episode, empty when there is no episode', () => {
  expect(playerStatusOf({ kind: 'idle' })).toBe('idle|');
  expect(playerStatusOf({ kind: 'error', message: 'x' })).toBe('error|');
  expect(playerStatusOf({ kind: 'ended', episodeId: 'e9' })).toBe('ended|e9');
});
