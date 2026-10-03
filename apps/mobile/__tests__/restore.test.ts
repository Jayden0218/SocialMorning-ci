/**
 * Story 3, end to end through the real runtime and the real stores: play,
 * die, come back.
 *
 * This is the one gate item a machine with no phone can honestly exercise
 * (constitution, "what a sandbox cannot verify"). It still proves only that
 * the LOGIC restores a position — that the position survives Android killing
 * the process is quickstart Tier B rows 4 and 4b.
 */
import { hash } from '../src/feeds/hash';
import { createPlayerRuntime, type PlayableEpisode, type PlayerRuntime } from '../src/playback/store';
import { SAVE_EVERY_MS, type Effect } from '../src/playback/types';
import { createMemoryStores } from '../src/storage/memory';
import { toPlayable } from '../src/storage/playable';
import type { AdapterEvent, AudioAdapter } from '../src/playback/expo-audio-adapter';
import type { Episode, ParsedFeed, Show } from '@socialmorning/feed-parser';

const HOUR = 3_600_000;
const FEED = 'https://example.com/show/feed.xml';

const episodeOf = (guid: string, durationMs?: number): Episode => ({
  guid,
  guidSource: 'guid',
  title: `Episode ${guid}`,
  enclosureUrl: `https://cdn.example.com/${guid}.mp3`,
  ...(durationMs !== undefined && { durationMs }),
  publishedAt: 1_000,
  explicit: false,
  transcripts: [],
  soundbites: [],
  contentHash: `hash-${guid}`,
});

const parsed = (episodes: Episode[]): ParsedFeed => ({
  show: {
    feedUrl: FEED,
    title: 'A Show',
    imageUrl: 'https://art.example.com/600.jpg',
    explicit: false,
    categories: [],
    contentHash: 'showhash',
  } satisfies Show,
  episodes,
  warnings: [],
});

type Rig = {
  stores: ReturnType<typeof createMemoryStores>;
  runtime: PlayerRuntime;
  executed: Effect[];
  push: (event: AdapterEvent) => void;
};

/** A fresh process against the SAME stores — a restart, not a reset. */
function boot(stores: ReturnType<typeof createMemoryStores>): Rig {
  const executed: Effect[] = [];
  let listener: ((event: AdapterEvent) => void) | undefined;
  const adapter: AudioAdapter = {
    execute: async (effect) => void executed.push(effect),
    subscribe: (l) => {
      listener = l;
      return () => undefined;
    },
    configure: async () => undefined,
    release: () => undefined,
  };
  const runtime = createPlayerRuntime({
    adapter,
    stores,
    now: () => Date.now(),
    notify: () => undefined,
  });
  return { stores, runtime, executed, push: (event) => listener?.(event) };
}

function seededStores(): ReturnType<typeof createMemoryStores> {
  const stores = createMemoryStores(hash);
  stores.feeds.put(FEED, parsed([episodeOf('a', HOUR), episodeOf('b', HOUR)]), {}, 1);
  return stores;
}

const idOf = (stores: ReturnType<typeof createMemoryStores>, guid: string): string => {
  const found = stores.feeds.listEpisodes(FEED).find((e) => e.guid === guid);
  if (found === undefined) throw new Error(`no episode ${guid}`);
  return found.id;
};

const playable = (stores: ReturnType<typeof createMemoryStores>, guid: string): PlayableEpisode => {
  const episode = toPlayable(stores, idOf(stores, guid));
  if (episode === undefined) throw new Error(`no playable ${guid}`);
  return episode;
};

describe('restoring after the process died', () => {
  // (a) FR-018: each episode keeps its own place.
  it('two episodes each come back at their own offset', () => {
    const stores = seededStores();
    const first = boot(stores);

    first.runtime.load(playable(stores, 'a'), 'play');
    first.push({ type: 'LOADED', durationMs: HOUR });
    first.push({ type: 'TICK', positionMs: 872_000, durationMs: HOUR });

    first.runtime.load(playable(stores, 'b'), 'play');
    first.push({ type: 'LOADED', durationMs: HOUR });
    first.push({ type: 'TICK', positionMs: 61_000, durationMs: HOUR });

    // The process dies here. Everything below is a fresh runtime.
    const reopened = boot(stores);
    expect(reopened.runtime.startPositionFor(playable(stores, 'a'))).toBe(872_000);
    expect(reopened.runtime.startPositionFor(playable(stores, 'b'))).toBe(61_000);
  });

  // (b) FR-019: a finished episode is offered from the beginning.
  it('a finished episode restores at zero', () => {
    const stores = seededStores();
    const first = boot(stores);
    first.runtime.load(playable(stores, 'a'), 'play');
    first.push({ type: 'LOADED', durationMs: HOUR });
    first.push({ type: 'ENDED' });

    expect(stores.positions.get(idOf(stores, 'a'))?.finished).toBe(true);
    expect(boot(stores).runtime.startPositionFor(playable(stores, 'a'))).toBe(0);
  });

  // (c) FR-020: the publisher replaced the file with a shorter one.
  it('an offset past the new duration restores as finished, from zero', () => {
    const stores = seededStores();
    stores.positions.save({ episodeId: idOf(stores, 'a'), offsetMs: 4_000_000, finished: false }, 1);
    const shorter = { ...playable(stores, 'a'), durationMs: 3_000_000 };
    expect(boot(stores).runtime.startPositionFor(shorter)).toBe(0);
  });

  // (d) The rule Story 3 turns on: restore NEVER auto-plays.
  it('restore loads the last session paused, at its saved position', () => {
    const stores = seededStores();
    const first = boot(stores);
    first.runtime.load(playable(stores, 'a'), 'play');
    first.push({ type: 'LOADED', durationMs: HOUR });
    first.push({ type: 'TICK', positionMs: 872_000, durationMs: HOUR });

    const reopened = boot(stores);
    reopened.runtime.restore((id) => toPlayable(stores, id));
    reopened.push({ type: 'LOADED', durationMs: HOUR });

    expect(reopened.executed).toEqual([
      { kind: 'load', url: 'https://cdn.example.com/a.mp3', startMs: 872_000 },
      // M2: the remembered rate is re-applied on every LOADED, paused or not.
      { kind: 'setRate', rate: 1 },
    ]);
    expect(reopened.executed.map((e) => e.kind)).not.toContain('play');
    expect(reopened.runtime.getState()).toMatchObject({
      kind: 'paused',
      positionMs: 872_000,
      by: 'user',
    });
  });

  it('and then playing continues from there rather than from the start', () => {
    const stores = seededStores();
    stores.positions.save({ episodeId: idOf(stores, 'a'), offsetMs: 872_000, finished: false }, 1);
    stores.session.set({ episodeId: idOf(stores, 'a'), intent: 'play' }, 1);

    const reopened = boot(stores);
    reopened.runtime.restore((id) => toPlayable(stores, id));
    reopened.push({ type: 'LOADED', durationMs: HOUR });
    reopened.runtime.play();

    expect(reopened.runtime.getState()).toMatchObject({ kind: 'playing', positionMs: 872_000 });
  });
});

describe('how much a surprise kill can cost (FR-016, SC-005)', () => {
  // The 5-second promise, measured end to end through the real stores rather
  // than asserted about the reducer in isolation.
  it('never leaves more than 5 000 ms unsaved across a minute of playback', () => {
    const stores = seededStores();
    const rig = boot(stores);
    const id = idOf(stores, 'a');

    rig.runtime.load(playable(stores, 'a'), 'play');
    rig.push({ type: 'LOADED', durationMs: HOUR });

    let worstLoss = 0;
    for (let ms = 500; ms <= 60_000; ms += 500) {
      rig.push({ type: 'TICK', positionMs: ms, durationMs: HOUR });
      // If Android killed us right now, this is what we would lose.
      worstLoss = Math.max(worstLoss, ms - (stores.positions.get(id)?.offsetMs ?? 0));
    }

    expect(worstLoss).toBeLessThanOrEqual(SAVE_EVERY_MS);
    expect(stores.positions.get(id)?.progressSeq).toBeGreaterThanOrEqual(12);
  });

  // "Exact after a force-quit or pause" — the other half of SC-005.
  it('is exact after a pause or a move to the background', () => {
    const stores = seededStores();
    const rig = boot(stores);
    const id = idOf(stores, 'a');

    rig.runtime.load(playable(stores, 'a'), 'play');
    rig.push({ type: 'LOADED', durationMs: HOUR });
    rig.push({ type: 'TICK', positionMs: 872_123, durationMs: HOUR });
    rig.push({ type: 'APP_BACKGROUND' });
    expect(stores.positions.get(id)?.offsetMs).toBe(872_123);

    rig.push({ type: 'TICK', positionMs: 873_400, durationMs: HOUR });
    rig.runtime.pause();
    expect(stores.positions.get(id)?.offsetMs).toBe(873_400);
  });
});
