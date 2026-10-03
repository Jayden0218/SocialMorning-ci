/**
 * M10b US4 (FR-014) — guard G-M1: with "Allow mobile data for playback" off and the phone on
 * mobile data, a not-downloaded episode does not stream; a downloaded file still plays.
 * The break that turns this red: delete the `mayStream` check in `load` in
 * `src/playback/store.ts`.
 */
import { createPlayerRuntime, type PlayableEpisode } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { Effect } from '@/playback/types';
import type { AudioAdapter } from '@/playback/expo-audio-adapter';
import { canStream } from '@/settings/playback';
import { setPref } from '@/settings/prefs';

const STREAM: PlayableEpisode = { id: 'e1', url: 'https://cdn.example.com/1.mp3', title: 'One', showTitle: 'S', durationMs: 60_000 };
const LOCAL: PlayableEpisode = { ...STREAM, id: 'e2', url: 'file:///data/e2.mp3' };

function setup(mayStream?: () => boolean) {
  const executed: Effect[] = [];
  const adapter: AudioAdapter = { execute: async (e) => void executed.push(e), subscribe: () => () => undefined, configure: async () => undefined, release: () => undefined };
  const notified: string[] = [];
  const runtime = createPlayerRuntime({ adapter, stores: createMemoryStores(hash), now: () => 1, notify: (m) => void notified.push(m), ...(mayStream ? { mayStream } : {}) });
  return { runtime, executed, notified };
}

it('G-M1: refused to stream, told why; a downloaded file plays', () => {
  const { runtime, executed, notified } = setup(() => false);
  runtime.load(STREAM, 'play');
  expect(executed).toEqual([]);
  expect(notified[0]).toMatch(/mobile data is off/);
  runtime.load(LOCAL, 'play');
  expect(executed.map((e) => e.kind)).toEqual(['load']);
});

it('allowed, or no check wired: streams as before', () => {
  const a = setup(() => true);
  a.runtime.load(STREAM, 'play');
  expect(a.executed.map((e) => e.kind)).toEqual(['load']);
  const b = setup();
  b.runtime.load(STREAM, 'play');
  expect(b.executed.map((e) => e.kind)).toEqual(['load']);
});

it('canStream: only mobile data with the switch off says no', () => {
  const { settings } = createMemoryStores(hash);
  expect(canStream(settings, 'cellular')).toBe(true);
  expect(canStream(settings, 'wifi')).toBe(true);
  setPref(settings, 'mobilePlayback', false);
  expect(canStream(settings, 'cellular')).toBe(false);
  expect(canStream(settings, 'wifi')).toBe(true);
  expect(canStream(settings, 'none')).toBe(true); // offline is the player's own error, not this switch's
});
