/**
 * The binding: reducer -> effects -> adapter, stores and timers.
 *
 * The adapter is a fake that records what it was told to do and lets the test
 * push events back. No expo module is imported by anything under test here,
 * which is the whole reason this layer can be checked at all.
 */
import { createPlayerRuntime, type PlayableEpisode, type PlayerRuntime } from '../src/playback/store';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';
import { RESUME_WATCH_MS, type Effect } from '../src/playback/types';
import type { AdapterEvent, AudioAdapter } from '../src/playback/expo-audio-adapter';

const HOUR = 3_600_000;

const EPISODE: PlayableEpisode = {
  id: 'e1',
  url: 'https://cdn.example.com/1.mp3',
  title: 'Episode 1',
  showTitle: 'A Show',
  artworkUrl: 'https://art.example.com/600.jpg',
  durationMs: HOUR,
};

type Fake = {
  adapter: AudioAdapter;
  executed: Effect[];
  push: (event: AdapterEvent) => void;
  released: () => boolean;
};

function fakeAdapter(): Fake {
  const executed: Effect[] = [];
  let listener: ((event: AdapterEvent) => void) | undefined;
  let unsubscribed = false;
  return {
    executed,
    push: (event) => listener?.(event),
    released: () => unsubscribed,
    adapter: {
      execute: async (effect) => void executed.push(effect),
      subscribe(l) {
        listener = l;
        return () => {
          unsubscribed = true;
        };
      },
      configure: async () => undefined,
      release: () => undefined,
    },
  };
}

function setup(now = () => 1_000): {
  fake: Fake;
  runtime: PlayerRuntime;
  stores: ReturnType<typeof createMemoryStores>;
  notified: string[];
} {
  const fake = fakeAdapter();
  const stores = createMemoryStores(hash);
  const notified: string[] = [];
  const runtime = createPlayerRuntime({
    adapter: fake.adapter,
    stores,
    now,
    notify: (message) => void notified.push(message),
  });
  return { fake, runtime, stores, notified };
}

const kinds = (effects: Effect[]): string[] => effects.map((e) => e.kind);

describe('load, play, tick, pause', () => {
  it('runs the player effects through the adapter and the writes through the stores', () => {
    const { fake, runtime, stores } = setup();

    runtime.load(EPISODE, 'play');
    expect(kinds(fake.executed)).toEqual(['load']);
    expect(stores.session.get()).toMatchObject({ episodeId: 'e1', intent: 'play' });

    fake.push({ type: 'LOADED', durationMs: HOUR });
    // M2: setRate sits between the lock screen and play (rate 1 at first).
    expect(kinds(fake.executed)).toEqual(['load', 'setLockScreen', 'setRate', 'play']);

    fake.push({ type: 'TICK', positionMs: 6_000, durationMs: HOUR });
    expect(stores.positions.get('e1')).toMatchObject({
      offsetMs: 6_000,
      durationMsAtSave: HOUR,
      finished: false,
      progressSeq: 1,
    });

    runtime.pause();
    expect(kinds(fake.executed)).toContain('pause');
    expect(stores.positions.get('e1')?.progressSeq).toBe(2);
    expect(stores.session.get()).toMatchObject({ intent: 'pause' });
  });

  it('M2: setRate reaches the adapter as a setRate effect', () => {
    const { fake, runtime } = setup();
    runtime.setRate(1.5);
    expect(fake.executed).toEqual([{ kind: 'setRate', rate: 1.5 }]);
  });

  it('stamps the current loadId onto the adapter’s LOADED (A12)', () => {
    const { fake, runtime } = setup();
    runtime.load(EPISODE, 'play');
    runtime.load({ ...EPISODE, id: 'e2', url: 'https://cdn.example.com/2.mp3' }, 'play');

    fake.push({ type: 'LOADED', durationMs: HOUR });

    // One play, for the second episode. The adapter never sends a loadId, so
    // if the runtime stamped a stale one this would be ignored instead.
    expect(kinds(fake.executed).filter((k) => k === 'play')).toHaveLength(1);
    expect(runtime.getState()).toMatchObject({ kind: 'playing', episodeId: 'e2' });
  });

  it('notifies the listener rather than failing silently (FR-015)', () => {
    const { fake, runtime, notified } = setup();
    runtime.load(EPISODE, 'pause');
    fake.push({ type: 'ERROR', message: 'MediaCodec 0x80001001' });

    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatch(/could not be played/i);
    expect(notified[0]).not.toMatch(/MediaCodec/);
  });

  it('tells subscribers the state changed', () => {
    const { fake, runtime } = setup();
    let notices = 0;
    const off = runtime.subscribe(() => void (notices += 1));

    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    expect(notices).toBe(2);

    off();
    fake.push({ type: 'TICK', positionMs: 1_000 });
    expect(notices).toBe(2);
  });
});

describe('timers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('a yield that never comes back expires after 30 s and stays paused (FR-011a)', () => {
    const { fake, runtime } = setup();
    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    fake.push({ type: 'TICK', positionMs: 600_000, durationMs: HOUR });
    fake.push({ type: 'EXTERNAL_PAUSE', at: 600_000 });

    expect(runtime.getState().kind).toBe('yielded');

    jest.advanceTimersByTime(RESUME_WATCH_MS - 1);
    expect(runtime.getState().kind).toBe('yielded');

    jest.advanceTimersByTime(1);
    expect(runtime.getState()).toMatchObject({ kind: 'paused', by: 'user' });
    // And crucially: nothing asked the player to start again.
    expect(kinds(fake.executed).filter((k) => k === 'play')).toHaveLength(1);
  });

  it('a call that ends inside the window resumes without the timer firing', () => {
    const { fake, runtime } = setup();
    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    fake.push({ type: 'EXTERNAL_PAUSE', at: 1_000 });
    jest.advanceTimersByTime(3_000);
    fake.push({ type: 'EXTERNAL_RESUME' });

    expect(runtime.getState().kind).toBe('playing');
    jest.advanceTimersByTime(RESUME_WATCH_MS);
    // The stale watch must not knock a resumed session back to paused.
    expect(runtime.getState().kind).toBe('playing');
  });

  it('retries on a schedule and reloads at the stalled position (SC-006)', () => {
    const { fake, runtime } = setup();
    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    fake.push({ type: 'TICK', positionMs: 100_000, durationMs: HOUR });
    fake.executed.length = 0;

    fake.push({ type: 'ERROR', message: 'stalled' });
    expect(kinds(fake.executed)).toEqual([]);

    jest.advanceTimersByTime(2_000);
    expect(fake.executed).toEqual([
      { kind: 'load', url: EPISODE.url, startMs: 100_000 },
      { kind: 'play' },
    ]);
  });

  it('dispose stops the timers and the subscription', () => {
    const { fake, runtime } = setup();
    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    fake.push({ type: 'EXTERNAL_PAUSE', at: 1 });

    runtime.dispose();
    jest.advanceTimersByTime(RESUME_WATCH_MS * 2);

    expect(runtime.getState().kind).toBe('yielded');
    expect(fake.released()).toBe(true);
  });
});

describe('where an episode starts (FR-019, FR-020)', () => {
  it('starts at zero when it has never been played', () => {
    const { runtime } = setup();
    expect(runtime.startPositionFor(EPISODE)).toBe(0);
  });

  it('starts at the saved position', () => {
    const { runtime, stores } = setup();
    stores.positions.save({ episodeId: 'e1', offsetMs: 872_000, finished: false }, 1);
    expect(runtime.startPositionFor(EPISODE)).toBe(872_000);
  });

  it('starts a finished episode from the beginning', () => {
    const { runtime, stores } = setup();
    stores.positions.save({ episodeId: 'e1', offsetMs: HOUR - 1_000, finished: true }, 1);
    expect(runtime.startPositionFor(EPISODE)).toBe(0);
  });

  it('starts from the beginning when the shorter new file makes it finished', () => {
    const { runtime, stores } = setup();
    stores.positions.save({ episodeId: 'e1', offsetMs: 4_000_000, finished: false }, 1);
    expect(runtime.startPositionFor({ ...EPISODE, durationMs: 3_000_000 })).toBe(0);
  });

  it('loads from the saved position rather than from zero', () => {
    const { fake, runtime, stores } = setup();
    stores.positions.save({ episodeId: 'e1', offsetMs: 872_000, finished: false }, 1);
    runtime.load(EPISODE, 'play');
    expect(fake.executed[0]).toEqual({
      kind: 'load',
      url: EPISODE.url,
      startMs: 872_000,
    });
  });

  it('carries artwork through to the lock screen, and copes without it', () => {
    const { fake, runtime } = setup();
    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    expect(fake.executed.find((e) => e.kind === 'setLockScreen')).toEqual({
      kind: 'setLockScreen',
      meta: { title: 'Episode 1', artist: 'A Show', artworkUrl: EPISODE.artworkUrl },
    });

    const bare = setup();
    const { artworkUrl: _dropped, ...noArt } = EPISODE;
    bare.runtime.load(noArt, 'play');
    bare.fake.push({ type: 'LOADED' });
    expect(bare.fake.executed.find((e) => e.kind === 'setLockScreen')).toEqual({
      kind: 'setLockScreen',
      meta: { title: 'Episode 1', artist: 'A Show' },
    });
  });
});

describe('restore (Story 3)', () => {
  it('puts back the last session PAUSED, never playing', () => {
    const { fake, runtime, stores } = setup();
    stores.session.set({ episodeId: 'e1', intent: 'play' }, 1);
    stores.positions.save({ episodeId: 'e1', offsetMs: 872_000, finished: false }, 1);

    runtime.restore((id) => (id === 'e1' ? EPISODE : undefined));
    fake.push({ type: 'LOADED', durationMs: HOUR });

    expect(runtime.getState()).toMatchObject({ kind: 'paused', positionMs: 872_000 });
    expect(kinds(fake.executed)).not.toContain('play');
  });

  it('does nothing when there is no session', () => {
    const { fake, runtime } = setup();
    runtime.restore(() => EPISODE);
    expect(fake.executed).toEqual([]);
  });

  it('does nothing when the session names no episode', () => {
    const { fake, runtime, stores } = setup();
    stores.session.set({ intent: 'pause' }, 1);
    runtime.restore(() => EPISODE);
    expect(fake.executed).toEqual([]);
  });

  it('does nothing when the episode has since gone from the cache', () => {
    const { fake, runtime, stores } = setup();
    stores.session.set({ episodeId: 'gone', intent: 'pause' }, 1);
    runtime.restore(() => undefined);
    expect(fake.executed).toEqual([]);
  });
});

describe('transport controls', () => {
  it('seek and skip reach the adapter and save the position', () => {
    const { fake, runtime, stores } = setup();
    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });

    runtime.seek(120_000);
    expect(fake.executed).toContainEqual({ kind: 'seek', toMs: 120_000 });

    runtime.skip(30_000);
    expect(fake.executed).toContainEqual({ kind: 'seek', toMs: 150_000 });

    runtime.skip(-15_000);
    expect(fake.executed).toContainEqual({ kind: 'seek', toMs: 135_000 });

    expect(stores.positions.get('e1')?.offsetMs).toBe(135_000);
  });

  it('play resumes a paused episode', () => {
    const { fake, runtime } = setup();
    runtime.load(EPISODE, 'pause');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    fake.executed.length = 0;

    runtime.play();
    expect(kinds(fake.executed)).toEqual(['setLockScreen', 'play']);
  });

  it('APP_BACKGROUND writes the position (FR-016)', () => {
    const { fake, runtime, stores } = setup();
    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    fake.push({ type: 'TICK', positionMs: 3_000, durationMs: HOUR });
    expect(stores.positions.get('e1')).toBeUndefined();

    fake.push({ type: 'APP_BACKGROUND' });
    expect(stores.positions.get('e1')?.offsetMs).toBe(3_000);
  });

  it('ENDED clears the lock screen and marks the episode finished', () => {
    const { fake, runtime, stores } = setup();
    runtime.load(EPISODE, 'play');
    fake.push({ type: 'LOADED', durationMs: HOUR });
    fake.push({ type: 'ENDED' });
    expect(kinds(fake.executed)).toContain('clearLockScreen');
    expect(stores.positions.get('e1')?.finished).toBe(true);
  });
});
