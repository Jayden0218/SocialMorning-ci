/**
 * M17 guard G-RF1 — playing a finished episode again must not be turned back into "Finished".
 *
 * Found on the phone 2026-10-02 (docs/M16a-GATE-LOG.md, "Seen, not caused on purpose"):
 * "Episode 271" was played from 0:00 and paused at 0:45; it then read "Finished" with its
 * position at the end (1:31:58). Nothing marks the previous episode finished on a load — the
 * reducer's LOAD saves nothing for it. The cause is the sync: the server's merge
 * (packages/social-core/src/merge.ts) keeps `finished` sticky and never lets progress go
 * backwards unless the incoming save is an explicit seek. The replay (FR-019 starts a finished
 * episode at 0) saved 0:45 as plain progress, lost to the stored "finished at the end", and the
 * sync reply wrote that back over the phone's row (src/sync/positions.ts applyRemote).
 *
 * Fix (src/playback/store.ts): the first save after a finished episode is played again — loaded,
 * or Play on `ended` — is marked explicit, so merge rule 2 clears `finished` everywhere.
 *
 * The break that turns it red: in src/playback/store.ts change
 * `explicitSeek: effect.explicitSeek || (restart && !effect.finished),` to
 * `explicitSeek: effect.explicitSeek,`.
 */
import { mergePosition, type PositionObs } from '@socialmorning/social-core';
import { createPlayerRuntime, type PlayableEpisode } from '@/playback/store';
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import type { AdapterEvent, AudioAdapter } from '@/playback/expo-audio-adapter';

const END = 5_518_000; // 1:31:58
const EPISODE: PlayableEpisode = { id: 'e271', url: 'https://cdn.example.com/271.mp3', title: 'Episode 271', showTitle: 'Podcasting 2.0', durationMs: END };
const OTHER: PlayableEpisode = { id: 'e189', url: 'https://cdn.example.com/189.mp3', title: '#189', showTitle: 'Another', durationMs: 3_600_000 };

function setup() {
  let listener: ((e: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = {
    execute: async () => undefined,
    subscribe: (l) => { listener = l; return () => undefined; },
    configure: async () => undefined,
    release: () => undefined,
  };
  const stores = createMemoryStores(hash);
  const runtime = createPlayerRuntime({ adapter, stores, now: () => 1_000, notify: () => undefined });
  return { stores, runtime, push: (e: AdapterEvent) => listener?.(e) };
}

/** The server's stored row: finished at the end, from an earlier listen. */
const serverFinished: PositionObs = { episodeId: 'e271', offsetMs: END, finished: true, progressSeq: 9, explicitSeek: false, receivedAt: 100 };

describe('a finished episode played again', () => {
  it('loading it and pausing at 0:45 saves an explicit position, which the server merge keeps', () => {
    const { stores, runtime, push } = setup();
    stores.positions.save({ episodeId: 'e271', offsetMs: END, finished: true }, 1);
    runtime.load(EPISODE, 'play');
    push({ type: 'LOADED', durationMs: END });
    push({ type: 'TICK', positionMs: 45_000, durationMs: END });
    runtime.pause();
    const row = stores.positions.get('e271')!;
    expect(row).toMatchObject({ offsetMs: 45_000, finished: false, explicitSeek: true });

    // What the sync sends; the server merges it with what it has.
    const merged = mergePosition(serverFinished, { episodeId: 'e271', offsetMs: row.offsetMs, finished: row.finished, progressSeq: row.progressSeq, explicitSeek: row.explicitSeek, receivedAt: 200 });
    expect(merged).toMatchObject({ offsetMs: 45_000, finished: false });
  });

  it('the cause, pinned: a plain save loses to the server\'s sticky "finished at the end"', () => {
    const merged = mergePosition(serverFinished, { episodeId: 'e271', offsetMs: 45_000, finished: false, progressSeq: 10, explicitSeek: false, receivedAt: 200 });
    expect(merged).toMatchObject({ offsetMs: END, finished: true });
  });

  it('Play on an ended episode is a restart too', () => {
    const { stores, runtime, push } = setup();
    runtime.load(EPISODE, 'play');
    push({ type: 'LOADED', durationMs: END });
    push({ type: 'ENDED' });
    expect(stores.positions.get('e271')?.finished).toBe(true);
    runtime.play();
    push({ type: 'TICK', positionMs: 6_000, durationMs: END });
    expect(stores.positions.get('e271')).toMatchObject({ offsetMs: 6_000, finished: false, explicitSeek: true });
  });

  it('only the first save is marked; later ticks are plain progress', () => {
    const { stores, runtime, push } = setup();
    stores.positions.save({ episodeId: 'e271', offsetMs: END, finished: true }, 1);
    runtime.load(EPISODE, 'play');
    push({ type: 'LOADED', durationMs: END });
    push({ type: 'TICK', positionMs: 6_000, durationMs: END });
    const first = stores.positions.get('e271')!;
    expect(first.explicitSeek).toBe(true);
    stores.positions.markSynced('e271', first.progressSeq); // the server has seen it
    push({ type: 'TICK', positionMs: 12_000, durationMs: END });
    expect(stores.positions.get('e271')).toMatchObject({ offsetMs: 12_000, explicitSeek: false });
  });

  it('a restart that runs straight to the end saves "finished", not an explicit seek', () => {
    const { stores, runtime, push } = setup();
    stores.positions.save({ episodeId: 'e271', offsetMs: END, finished: true }, 1);
    runtime.load(EPISODE, 'play');
    push({ type: 'LOADED', durationMs: END });
    push({ type: 'ENDED' });
    expect(stores.positions.get('e271')).toMatchObject({ finished: true, explicitSeek: false });
  });

  it('an episode that was not finished is not marked, and loading another ends a restart', () => {
    const { stores, runtime, push } = setup();
    stores.positions.save({ episodeId: 'e271', offsetMs: END, finished: true }, 1);
    runtime.load(EPISODE, 'pause'); // restored, never played
    push({ type: 'LOADED', durationMs: END });
    runtime.load(OTHER, 'play'); // e.g. a row tapped in Up next
    push({ type: 'LOADED', durationMs: 3_600_000 });
    push({ type: 'TICK', positionMs: 6_000, durationMs: 3_600_000 });
    expect(stores.positions.get('e189')).toMatchObject({ finished: false, explicitSeek: false });
    // The finished episode it replaced is untouched — a load never marks the previous one.
    expect(stores.positions.get('e271')).toMatchObject({ offsetMs: END, finished: true });
  });
});
