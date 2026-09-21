/**
 * The React wrapper around the runtime. Small, but it is the thing every
 * screen touches, and `usePlayer` outside a provider is the mistake that
 * shows up as an unrelated crash three screens away.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  PlayerProvider,
  createPlayerRuntime,
  usePlayer,
  usePlayerState,
  type PlayableEpisode,
  type PlayerRuntime,
} from '../src/playback/store';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '../src/playback/expo-audio-adapter';

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

function Kind(): React.ReactElement {
  return createElement(Text, null, usePlayerState().kind);
}

it('re-renders when the player state changes', () => {
  const { runtime, push } = harness();
  let tree: ReturnType<typeof create> | undefined;

  act(() => {
    tree = create(createElement(PlayerProvider, { runtime }, createElement(Kind)));
  });
  expect(tree?.toJSON()).toMatchObject({ children: ['idle'] });

  act(() => {
    runtime.load(EPISODE, 'play');
  });
  expect(tree?.toJSON()).toMatchObject({ children: ['loading'] });

  act(() => {
    push({ type: 'LOADED', durationMs: 1_000 });
  });
  expect(tree?.toJSON()).toMatchObject({ children: ['playing'] });
});

it('usePlayer hands back the runtime it was given', () => {
  const { runtime } = harness();
  let seen: PlayerRuntime | undefined;
  function Grab(): null {
    seen = usePlayer();
    return null;
  }
  act(() => {
    create(createElement(PlayerProvider, { runtime }, createElement(Grab)));
  });
  expect(seen).toBe(runtime);
});

it('usePlayer outside a provider says so instead of crashing obscurely', () => {
  function Orphan(): null {
    usePlayer();
    return null;
  }
  // react-test-renderer logs the boundary-less error; silence it for this one.
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() =>
    act(() => {
      create(createElement(Orphan));
    }),
  ).toThrow(/inside a <PlayerProvider>/);
  consoleError.mockRestore();
});
