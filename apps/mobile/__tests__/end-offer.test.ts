/** quickstart A10 (guard G7): the offer is shown only at `ended` with an empty queue, and choosing it is the only thing that loads. */
import { endOffer } from '../src/discover/end-offer';
import { createPlayerRuntime, type PlayableEpisode } from '../src/playback/store';
import type { AdapterEvent, AudioAdapter } from '../src/playback/expo-audio-adapter';
import type { Effect } from '../src/playback/types';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';
import type { NextUpItem } from '../src/social/api';

const item: NextUpItem = { episode: { id: 'n1', feedUrl: 'f', guid: 'g', title: 'Next one', showTitle: 'S', enclosureUrl: 'https://cdn/n1.mp3' }, reason: 'newOnShow', label: 'New on this show' };

it('endOffer: only at ended + empty queue + a list for this episode', () => {
  expect(endOffer({ kind: 'ended', episodeId: 'a' }, [], [item], 'a')).toEqual(item);
  expect(endOffer({ kind: 'playing', episodeId: 'a' }, [], [item], 'a')).toBeUndefined();
  expect(endOffer({ kind: 'ended', episodeId: 'a' }, ['q1'], [item], 'a')).toBeUndefined();
  expect(endOffer({ kind: 'ended', episodeId: 'a' }, [], [], 'a')).toBeUndefined();
  expect(endOffer({ kind: 'ended', episodeId: 'a' }, [], undefined, 'a')).toBeUndefined();
  expect(endOffer({ kind: 'ended', episodeId: 'a' }, [], [item], 'other')).toBeUndefined();
  expect(endOffer({ kind: 'ended', episodeId: 'a' }, [], [item], undefined)).toEqual(item);
});

it('G7: the runtime at the end of an episode with an empty queue emits no load; a load happens only when the listener taps Play', () => {
  const executed: Effect[] = [];
  let handler: ((e: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = { execute: async (e) => void executed.push(e), subscribe(l) { handler = l; return () => undefined; }, configure: async () => undefined, release: () => undefined };
  const stores = createMemoryStores(hash);
  const ep = (id: string): PlayableEpisode => ({ id, url: `https://cdn/${id}.mp3`, title: id, showTitle: 'S', durationMs: 60_000 });
  const runtime = createPlayerRuntime({ adapter, stores, now: () => 1, notify: () => {}, advance: { lookup: ep, online: () => true } });
  runtime.load(ep('a'), 'play');
  handler!({ type: 'LOADED', durationMs: 60_000 });
  handler!({ type: 'TICK', positionMs: 59_000, durationMs: 60_000 });
  const loadsBefore = executed.filter((e) => e.kind === 'load').length;
  handler!({ type: 'ENDED' });
  expect(runtime.getState().kind).toBe('ended');
  expect(executed.filter((e) => e.kind === 'load').length).toBe(loadsBefore); // nothing loaded by itself
  const offer = endOffer(runtime.getState(), stores.queue.list(), [item], 'a');
  expect(offer).toEqual(item);
  runtime.load(ep('n1'), 'play'); // the listener's tap
  expect(executed.filter((e) => e.kind === 'load').length).toBe(loadsBefore + 1);
});
