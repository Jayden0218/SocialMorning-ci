// Tests the M21 sleep timer in the runtime: the fade, the volume reset, a restart, End of episode + Loop.
/**
 * M21 US1 (FR-002, FR-005..FR-008). Every new branch in src/playback (held at 100 % branches).
 *
 * Guard G-M21-4. The break that turns it red: in src/playback/store.ts make `resetVolume`
 * return at once — "the pause is followed by full volume" and "cancel puts the volume back" fail.
 */
import { createExpoAudioAdapter, type AdapterEvent, type AudioAdapter } from '@/playback/expo-audio-adapter';
import { createPlayerRuntime, type PlayableEpisode } from '@/playback/store';
import type { Effect } from '@/playback/types';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

jest.useFakeTimers();

const ep = (id: string): PlayableEpisode => ({ id, url: `https://cdn/${id}.mp3`, title: id, showTitle: 'S', durationMs: 3_600_000, feedUrl: 'https://f/a.xml' });

function build(stores = createMemoryStores(hash), start = 1_000_000) {
  const executed: Effect[] = [];
  let handler: ((e: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = {
    execute: async (e) => void executed.push(e),
    subscribe(l) { handler = l; return () => { handler = undefined; }; },
    configure: async () => undefined,
    release: () => undefined,
  };
  let clock = start;
  const runtime = createPlayerRuntime({ adapter, stores, now: () => clock, notify: () => {}, advance: { lookup: ep, online: () => true } });
  const push = (e: AdapterEvent) => handler?.(e);
  const at = (ms: number) => { clock = start + ms; push({ type: 'TICK', positionMs: ms, durationMs: 3_600_000 }); };
  const volumes = () => executed.filter((e): e is Extract<Effect, { kind: 'setVolume' }> => e.kind === 'setVolume').map((e) => e.v);
  const loops = () => executed.filter((e): e is Extract<Effect, { kind: 'setLoop' }> => e.kind === 'setLoop').map((e) => e.on);
  const play = (id = 'a') => { runtime.load(ep(id), 'play'); push({ type: 'LOADED', durationMs: 3_600_000 }); };
  return { stores, runtime, executed, push, at, volumes, loops, play, setClock: (ms: number) => { clock = start + ms; } };
}

it('the adapter sets the player volume', async () => {
  const player: Record<string, unknown> = { addListener: () => ({ remove: () => undefined }) };
  const adapter = createExpoAudioAdapter(() => player as never);
  await adapter.execute({ kind: 'setVolume', v: 0.25 });
  expect(player['volume']).toBe(0.25);
});

it('G-M21-1/4: no fade before the last 10 s; ~20 steps down; tiny steps skipped; the pause is followed by full volume', () => {
  const b = build();
  b.play();
  b.runtime.setSleepTimer(5); // deadline +300 000
  b.at(289_000);
  expect(b.volumes()).toEqual([]);
  b.at(290_000);
  b.at(295_000);
  expect(b.volumes()).toEqual([1, 0.25]);
  b.at(295_050); // (4.95/10)² = 0.245 — under 0.02 from 0.25, not sent
  expect(b.volumes()).toEqual([1, 0.25]);
  b.at(300_000);
  const kinds = b.executed.map((e) => e.kind);
  expect(kinds.lastIndexOf('pause')).toBeLessThan(kinds.lastIndexOf('setVolume'));
  expect(b.volumes().at(-1)).toBe(1);
  expect(b.runtime.sleepTimer()).toEqual({ endOfEpisode: false });
});

it('G-M21-4: cancel and the listener\'s own Play during a fade put the volume back; cancel with no fade sends nothing', () => {
  const b = build();
  b.play();
  b.runtime.setSleepTimer(5);
  b.runtime.setSleepTimer('off');
  expect(b.volumes()).toEqual([]);
  b.runtime.setSleepTimer(5);
  b.at(295_000);
  b.runtime.setSleepTimer('off');
  expect(b.volumes()).toEqual([0.25, 1]);
  b.runtime.setSleepTimer(10); // deadline at +895 000
  b.at(890_000);
  b.runtime.pause();
  b.runtime.play();
  expect(b.volumes()).toEqual([0.25, 1, 0.25, 1]);
});

it('the foreground timeout fires the timer too, with no fade to undo', () => {
  const b = build();
  b.play();
  b.runtime.setSleepTimer(5);
  b.setClock(300_000);
  jest.advanceTimersByTime(300_000);
  expect(b.executed.map((e) => e.kind)).toContain('pause');
  expect(b.volumes()).toEqual([]);
});

it('G-M21-2: the timer is saved; a restart re-arms a future deadline, drops a past one, and keeps End of episode', () => {
  const first = build();
  first.play();
  first.runtime.setSleepTimer(30);
  first.runtime.setSleepEndOfEpisode(true);
  expect(first.stores.settings.get('sleep.deadline')).toBe(String(1_000_000 + 1_800_000));
  expect(first.stores.settings.get('sleep.endOfEpisode')).toBe('1');

  const again = build(first.stores, 1_000_000 + 600_000);
  again.runtime.restore(ep);
  expect(again.runtime.sleepRemainingMs()).toBe(1_200_000);
  expect(again.runtime.sleepTimer().minutes).toBe(30);
  expect(again.runtime.sleepTimer().endOfEpisode).toBe(true);

  const late = build(first.stores, 1_000_000 + 2_000_000);
  late.runtime.restore(() => undefined);
  expect(late.runtime.sleepTimer()).toEqual({ endOfEpisode: true });
  expect(late.stores.settings.get('sleep.deadline')).toBe('');
});

it('a restart with nothing saved and no session leaves the timer off', () => {
  const b = build();
  b.runtime.restore(ep);
  expect(b.runtime.sleepTimer()).toEqual({ endOfEpisode: false });
});

it('G-M21-3: End of episode turns the native loop off while it is on, and back when it goes', () => {
  const b = build();
  b.play();
  b.runtime.setLoop(true);
  b.runtime.setSleepEndOfEpisode(true);
  b.runtime.setLoop(true);
  b.runtime.setSleepEndOfEpisode(false);
  expect(b.loops()).toEqual([true, false, false, true]);
});

it('US1-5: End of episode and a minutes timer — the end comes first, both end, the queue stays', () => {
  const b = build();
  b.stores.queue.replace(['b'], 1);
  b.play();
  b.runtime.setSleepTimer(90);
  b.runtime.setSleepEndOfEpisode(true);
  b.push({ type: 'ENDED' });
  expect(b.stores.queue.list()).toEqual(['b']);
  expect(b.runtime.sleepTimer()).toEqual({ endOfEpisode: false });
  expect(b.stores.settings.get('sleep.endOfEpisode')).toBe('');
});

it('a hold asked for by someone else does not touch the timer', () => {
  const b = build();
  b.stores.queue.replace(['b'], 1);
  b.play();
  b.runtime.setSleepTimer(30);
  b.runtime.holdNextAdvance(true);
  b.push({ type: 'ENDED' });
  expect(b.stores.queue.list()).toEqual(['b']);
  expect(b.runtime.sleepRemainingMs()).toBe(1_800_000);
});

it('FR-016: End of episode belongs to its episode — loading another turns the switch off and saves that', () => {
  const b = build();
  b.play();
  b.runtime.setSleepTimer(15);
  b.runtime.setSleepEndOfEpisode(true);
  b.play('c');
  expect(b.runtime.sleepTimer().endOfEpisode).toBe(false);
  expect(b.runtime.sleepRemainingMs()).toBe(900_000);
  expect(b.stores.settings.get('sleep.endOfEpisode')).toBe('');
});
