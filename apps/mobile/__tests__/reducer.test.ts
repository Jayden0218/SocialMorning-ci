/**
 * quickstart.md Tier A, scenarios A1-A12, plus the seven invariants from
 * data-model.md.
 *
 * Tier A proves the LOGIC. It is not, and must never be reported as,
 * evidence that audio works — that is Tier B, on a phone, and nothing in
 * this file can reach it (Constitution Principle I).
 */
import { reduce, type Reduction } from '../src/playback/reducer';
import {
  INITIAL_CONTEXT,
  INITIAL_STATE,
  MAX_RETRIES,
  PLAYBACK_FAILED_MESSAGE,
  RESUME_WATCH_MS,
  SAVE_EVERY_MS,
  type Effect,
  type LockScreenMeta,
  type PlayerContext,
  type PlayerEvent,
  type PlayerState,
} from '../src/playback/types';
import { reconcileOffset } from '../src/playback/finished';

const HOUR = 3_600_000;
const META: LockScreenMeta = { title: 'Episode 1', artist: 'A Show', artworkUrl: 'a.jpg' };
const URL = 'https://cdn.example.com/1.mp3';

const load = (overrides: Partial<Extract<PlayerEvent, { type: 'LOAD' }>> = {}): PlayerEvent => ({
  type: 'LOAD',
  episodeId: 'e1',
  url: URL,
  startMs: 0,
  intent: 'play',
  meta: META,
  ...overrides,
});

type Run = {
  state: PlayerState;
  ctx: PlayerContext;
  effects: Effect[];
  steps: Reduction[];
};

function run(
  events: PlayerEvent[],
  state: PlayerState = INITIAL_STATE,
  ctx: PlayerContext = INITIAL_CONTEXT,
): Run {
  const effects: Effect[] = [];
  const steps: Reduction[] = [];
  for (const event of events) {
    const step = reduce(state, event, ctx);
    state = step.state;
    ctx = step.ctx;
    effects.push(...step.effects);
    steps.push(step);
  }
  return { state, ctx, effects, steps };
}

type Ms = number;

/** Get to `playing` the way the app does, then forget those effects. */
function started(durationMs: Ms | undefined, startMs: number): Run {
  const out = run([load({ startMs }), { type: 'LOADED', loadId: 1, durationMs }]);
  return { ...out, effects: [] };
}

const playing = (startMs = 0): Run => started(HOUR, startMs);
/** A feed that declared no `<itunes:duration>` — common, and not an error. */
const playingWithoutDuration = (startMs = 0): Run => started(undefined, startMs);

const kinds = (effects: Effect[]): string[] => effects.map((e) => e.kind);
const only = <K extends Effect['kind']>(
  effects: Effect[],
  kind: K,
): Extract<Effect, { kind: K }>[] =>
  effects.filter((e): e is Extract<Effect, { kind: K }> => e.kind === kind);

// ---------------------------------------------------------------------------
// quickstart.md Tier A
// ---------------------------------------------------------------------------

describe('A1 - a call arrives and ends', () => {
  it('ends playing, reasserts focus once, and saved the position on the way out', () => {
    const start = playing();
    const out = run(
      [
        { type: 'TICK', positionMs: 872_000, durationMs: HOUR },
        { type: 'EXTERNAL_PAUSE', at: 872_000 },
        { type: 'EXTERNAL_RESUME' },
      ],
      start.state,
      start.ctx,
    );

    expect(out.state.kind).toBe('playing');
    expect(only(out.effects, 'reassertFocus')).toHaveLength(1);
    expect(only(out.effects, 'savePosition').at(-1)).toMatchObject({
      episodeId: 'e1',
      offsetMs: 872_000,
      finished: false,
    });
  });
});

describe('A2 - a takeover that never gives the audio back (FR-011a)', () => {
  it('ends paused by user and emits NO play effect', () => {
    const start = playing();
    const out = run(
      [
        { type: 'TICK', positionMs: 600_000, durationMs: HOUR },
        { type: 'EXTERNAL_PAUSE', at: 600_000 },
        { type: 'RESUME_WATCH_EXPIRED' },
      ],
      start.state,
      start.ctx,
    );

    expect(out.state).toMatchObject({ kind: 'paused', by: 'user', positionMs: 600_000 });
    expect(kinds(out.effects)).not.toContain('play');
    expect(only(out.effects, 'startResumeWatch')[0]).toEqual({
      kind: 'startResumeWatch',
      ms: RESUME_WATCH_MS,
    });
  });
});

describe('M4 gap 2 - a lock-screen Play while paused by the listener follows the player', () => {
  it('paused by the user + EXTERNAL_RESUME → playing with focus reasserted, no play effect (the player is already playing)', () => {
    const start = playing();
    const out = run([{ type: 'PAUSE' }, { type: 'EXTERNAL_RESUME' }], start.state, start.ctx);
    expect(out.state).toMatchObject({ kind: 'playing' });
    expect(kinds(out.effects)).toContain('reassertFocus');
    expect(kinds(out.effects).filter((k) => k === 'play')).toHaveLength(0);
  });
});

describe('A3 - the bluetooth speaker was switched off (FR-012)', () => {
  it('stays paused by output-lost even when the player says it resumed', () => {
    const start = playing();
    const out = run(
      [{ type: 'OUTPUT_LOST' }, { type: 'EXTERNAL_RESUME' }],
      start.state,
      start.ctx,
    );

    expect(out.state).toMatchObject({ kind: 'paused', by: 'output-lost' });
    expect(kinds(out.effects)).not.toContain('play');
    expect(kinds(out.effects)).not.toContain('reassertFocus');
  });
});

describe('A4 - a tunnel, then a phone call (SC-007 ordering)', () => {
  // This is expo/expo#50072's own reproduction, and the reason the device
  // gate must run item 5 before item 2.
  it('reasserts focus after the rebuffer AND after the call', () => {
    const start = playing();
    const out = run(
      [
        { type: 'BUFFER_START' },
        { type: 'BUFFER_END' },
        { type: 'EXTERNAL_PAUSE', at: 1_000 },
        { type: 'EXTERNAL_RESUME' },
      ],
      start.state,
      start.ctx,
    );

    expect(kinds(out.effects).filter((k) => k === 'reassertFocus')).toHaveLength(2);
    expect(out.state.kind).toBe('playing');
  });
});

describe('A5 - sixty seconds of playback (FR-016)', () => {
  it('saves at least twelve times, never more than 5 000 ms apart', () => {
    const start = playing();
    const ticks: PlayerEvent[] = [];
    for (let ms = 1_000; ms <= 60_000; ms += 1_000) {
      ticks.push({ type: 'TICK', positionMs: ms, durationMs: HOUR });
    }
    const out = run(ticks, start.state, start.ctx);
    const saves = only(out.effects, 'savePosition');

    expect(saves.length).toBeGreaterThanOrEqual(12);
    let previous = 0;
    for (const save of saves) {
      expect(save.offsetMs - previous).toBeLessThanOrEqual(SAVE_EVERY_MS);
      previous = save.offsetMs;
    }
    expect(60_000 - previous).toBeLessThanOrEqual(SAVE_EVERY_MS);
  });
});

describe('A6 - stopping inside the last 30 seconds (FR-019)', () => {
  it('saves the position as finished', () => {
    const start = playing();
    const out = run(
      [{ type: 'SEEK', toMs: HOUR - 10_000 }, { type: 'PAUSE' }],
      start.state,
      start.ctx,
    );
    const saves = only(out.effects, 'savePosition');
    expect(saves.at(-1)).toMatchObject({ offsetMs: HOUR - 10_000, finished: true });
    expect(out.state).toMatchObject({ kind: 'paused', by: 'user' });
  });
});

describe('A7 - the publisher replaced the file with a shorter one (FR-020)', () => {
  it('reconciles a 4 000 000 offset against a 3 000 000 duration to finished', () => {
    expect(reconcileOffset(4_000_000, 3_000_000)).toEqual({
      offsetMs: 3_000_000,
      finished: true,
    });
  });
});

describe('A8 - force-quit, then reopened (Story 3)', () => {
  it('replaying the last saved row lands in loading at that exact position', () => {
    const start = playing();
    const before = run(
      [
        { type: 'TICK', positionMs: 872_000, durationMs: HOUR },
        { type: 'APP_BACKGROUND' },
      ],
      start.state,
      start.ctx,
    );
    const lastSave = only(before.effects, 'savePosition').at(-1);
    expect(lastSave?.offsetMs).toBe(872_000);

    // The process died here. A fresh reducer, seeded only from storage.
    const reopened = run([
      load({ startMs: lastSave?.offsetMs ?? 0, intent: 'pause' }),
    ]);
    expect(reopened.state).toMatchObject({
      kind: 'loading',
      positionMs: 872_000,
      intent: 'pause',
    });
    expect(only(reopened.effects, 'load')[0]).toEqual({
      kind: 'load',
      url: URL,
      startMs: 872_000,
    });
  });
});

describe('A9 - skip back on a short episode', () => {
  it('clamps to zero rather than seeking negative', () => {
    const start = playing(8_000);
    const out = run([{ type: 'SKIP', deltaMs: -15_000 }], start.state, start.ctx);
    expect(only(out.effects, 'seek')[0]).toEqual({ kind: 'seek', toMs: 0 });
    expect(out.state).toMatchObject({ kind: 'playing', positionMs: 0 });
  });

  it('skips forward by thirty seconds', () => {
    const start = playing(8_000);
    const out = run([{ type: 'SKIP', deltaMs: 30_000 }], start.state, start.ctx);
    expect(only(out.effects, 'seek')[0]).toEqual({ kind: 'seek', toMs: 38_000 });
  });
});

describe('A10 - telling the listener it failed (FR-015)', () => {
  it('notifies with a sentence a person can act on, not a codec error', () => {
    const start = playing();
    const out = run([{ type: 'PAUSE' }, { type: 'ERROR', message: 'MediaCodec 0x80001001' }],
      start.state, start.ctx);
    const notify = only(out.effects, 'notify')[0];

    expect(notify).toBeDefined();
    expect(notify?.message).toBe(PLAYBACK_FAILED_MESSAGE);
    expect(notify?.message.length).toBeGreaterThan(0);
    expect(notify?.message).not.toMatch(/MediaCodec|0x|Error:|undefined|null/);
    expect(out.state).toMatchObject({ kind: 'error', episodeId: 'e1' });
  });
});

describe('A11 - a tunnel long enough to kill the stream (FR-013, SC-006)', () => {
  it('retries 2, 4, 8, 16, 30, 30 s — a ~90 s window — reloading at the last position, and only then gives up', () => {
    const start = playing();
    const events: PlayerEvent[] = [{ type: 'TICK', positionMs: 100_000, durationMs: HOUR }];
    for (let i = 0; i < MAX_RETRIES; i++) {
      events.push({ type: 'ERROR', message: 'stalled' }, { type: 'RETRY_DUE' });
    }
    const out = run(events, start.state, start.ctx);

    expect(only(out.effects, 'scheduleRetry').map((e) => e.ms)).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    // Every retry reloads at the position it stalled at, not at zero.
    for (const reload of only(out.effects, 'load')) {
      expect(reload).toEqual({ kind: 'load', url: URL, startMs: 100_000 });
    }
    expect(only(out.effects, 'load')).toHaveLength(MAX_RETRIES);
    expect(kinds(out.effects)).not.toContain('notify');
    expect(out.ctx.retries).toBe(MAX_RETRIES);

    // The failure after the last retry is the one the listener hears about.
    const gaveUp = run([{ type: 'ERROR', message: 'stalled' }], out.state, out.ctx);
    expect(only(gaveUp.effects, 'notify')[0]?.message).toBe(PLAYBACK_FAILED_MESSAGE);
    expect(gaveUp.state.kind).toBe('error');
  });
});

describe('A13 - "Try again" from the error state (FR-015, watched dead on the phone 2026-09-20)', () => {
  it('PLAY from error reloads at the position it failed at and plays, with retries reset', () => {
    const start = playing();
    const events: PlayerEvent[] = [{ type: 'TICK', positionMs: 2_657_624, durationMs: HOUR }];
    for (let i = 0; i <= MAX_RETRIES; i++) {
      events.push({ type: 'ERROR', message: 'stalled' });
      if (i < MAX_RETRIES) events.push({ type: 'RETRY_DUE' });
    }
    const failed = run(events, start.state, start.ctx);
    expect(failed.state.kind).toBe('error');

    const again = reduce(failed.state, { type: 'PLAY' }, failed.ctx);
    expect(again.state).toMatchObject({ kind: 'loading', intent: 'play', positionMs: 2_657_624 });
    expect(only(again.effects, 'load')).toEqual([{ kind: 'load', url: URL, startMs: 2_657_624 }]);
    expect(kinds(again.effects)).toContain('play');
    expect(kinds(again.effects)).toContain('setLockScreen');
    expect(again.ctx.retries).toBe(0);
    expect(again.ctx.loadId).toBe(failed.ctx.loadId + 1);
  });

  it('an error that never had a position (failed before the first tick) tries again from the start', () => {
    const start = playing();
    const noPosition: PlayerState = { kind: 'error', episodeId: 'e1', message: PLAYBACK_FAILED_MESSAGE };
    const again = reduce(noPosition, { type: 'PLAY' }, start.ctx);
    expect(only(again.effects, 'load')).toEqual([{ kind: 'load', url: URL, startMs: 0 }]);
    expect(again.state).toMatchObject({ kind: 'loading', positionMs: 0 });
  });
});

describe('A12 - two episodes tapped in quick succession', () => {
  it('ignores the abandoned load and ends playing the second', () => {
    const out = run([
      load({ episodeId: 'A', url: 'https://cdn.example.com/A.mp3' }),
      load({ episodeId: 'B', url: 'https://cdn.example.com/B.mp3' }),
      { type: 'LOADED', loadId: 1, durationMs: 111 },
      { type: 'LOADED', loadId: 2, durationMs: 222 },
    ]);

    expect(out.state).toMatchObject({ kind: 'playing', episodeId: 'B', durationMs: 222 });
    // Exactly one play: the stale LOADED emitted nothing at all.
    expect(only(out.effects, 'play')).toHaveLength(1);
    expect(out.steps[2]?.effects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SC-007: the ordering IS the test (T040)
// ---------------------------------------------------------------------------

describe('SC-007 — running the tunnel immediately before the call', () => {
  // expo/expo#50072's own reproduction, in reducer form. Android releases
  // audio focus on any non-playing transition, buffering included, and
  // re-requests it only inside play(). A stream that healed itself is
  // therefore running with NO focus and will talk straight over the next
  // call. `reassertFocus` after the rebuffer is the mitigation; a second
  // one after the call is what puts focus back afterwards.
  it('emits reassertFocus after the rebuffer AND after the call, ending playing', () => {
    const start = playing();
    const out = run(
      [
        { type: 'BUFFER_START' },
        { type: 'BUFFER_END' },
        { type: 'EXTERNAL_PAUSE', at: 100_000 },
        { type: 'EXTERNAL_RESUME' },
      ],
      start.state,
      start.ctx,
    );

    expect(only(out.effects, 'reassertFocus')).toHaveLength(2);
    // And in that order: the buffer recovery first, the call second.
    const order = kinds(out.effects);
    expect(order.indexOf('reassertFocus')).toBeLessThan(order.lastIndexOf('reassertFocus'));
    expect(order.lastIndexOf('reassertFocus')).toBeGreaterThan(order.indexOf('savePosition'));
    expect(out.state).toMatchObject({ kind: 'playing', positionMs: 100_000 });
  });

  it('is the same result as the call on a clean session (that is the point)', () => {
    const clean = playing();
    const afterCall = run(
      [{ type: 'EXTERNAL_PAUSE', at: 100_000 }, { type: 'EXTERNAL_RESUME' }],
      clean.state,
      clean.ctx,
    );

    const stalled = playing();
    const afterStallThenCall = run(
      [
        { type: 'BUFFER_START' },
        { type: 'BUFFER_END' },
        { type: 'EXTERNAL_PAUSE', at: 100_000 },
        { type: 'EXTERNAL_RESUME' },
      ],
      stalled.state,
      stalled.ctx,
    );

    expect(afterStallThenCall.state).toEqual(afterCall.state);
  });
});

describe('a duck: interruption and recovery inside three seconds (FR-011)', () => {
  // A navigation prompt or a notification. The listener does nothing, and
  // playback must be back by itself — no user action anywhere in here.
  it('returns to playing with no user action and no resume-watch expiry', () => {
    const start = playing();
    const out = run(
      [{ type: 'EXTERNAL_PAUSE', at: 42_000 }, { type: 'EXTERNAL_RESUME' }],
      start.state,
      start.ctx,
    );

    expect(out.state).toMatchObject({ kind: 'playing', positionMs: 42_000 });
    expect(only(out.effects, 'reassertFocus')).toHaveLength(1);
    // The watch was started; it simply never got to fire.
    expect(only(out.effects, 'startResumeWatch')[0]?.ms).toBe(RESUME_WATCH_MS);
    // NOT VERIFIED on a device: whether Android even reports a duck this way.
    // A doNotMix player is expected to lower its volume and keep
    // `playing: true`, which JS never sees. Gate row 7 measures it; if it
    // ducks instead of pausing, T042's native focus listener is the answer.
  });

  it('and the position it comes back at is the one it left', () => {
    const start = playing();
    const out = run(
      [
        { type: 'TICK', positionMs: 42_000, durationMs: HOUR },
        { type: 'EXTERNAL_PAUSE', at: 42_000 },
        { type: 'EXTERNAL_RESUME' },
      ],
      start.state,
      start.ctx,
    );
    expect(only(out.effects, 'savePosition').at(-1)?.offsetMs).toBe(42_000);
    expect(out.state).toMatchObject({ positionMs: 42_000 });
  });
});

// ---------------------------------------------------------------------------
// data-model.md invariants
// ---------------------------------------------------------------------------

describe('invariants', () => {
  it('1. nothing but EXTERNAL_RESUME or a user PLAY leaves `yielded` playing', () => {
    const start = playing();
    const yielded = run([{ type: 'EXTERNAL_PAUSE', at: 1 }], start.state, start.ctx);

    const expired = run([{ type: 'RESUME_WATCH_EXPIRED' }], yielded.state, yielded.ctx);
    expect(expired.state.kind).toBe('paused');
    expect(expired.effects).toEqual([]);

    const byUser = run([{ type: 'PLAY' }], yielded.state, yielded.ctx);
    expect(byUser.state.kind).toBe('playing');
    expect(kinds(byUser.effects)).toContain('play');
  });

  it('2. `paused(by: output-lost)` never becomes playing without a user PLAY', () => {
    const start = playing();
    const lost = run([{ type: 'OUTPUT_LOST' }], start.state, start.ctx);

    for (const event of [
      { type: 'EXTERNAL_RESUME' } as const,
      { type: 'RESUME_WATCH_EXPIRED' } as const,
      { type: 'BUFFER_END' } as const,
    ]) {
      const after = run([event], lost.state, lost.ctx);
      expect(after.state).toMatchObject({ kind: 'paused', by: 'output-lost' });
    }

    const byUser = run([{ type: 'PLAY' }], lost.state, lost.ctx);
    expect(byUser.state.kind).toBe('playing');
  });

  it('3. every BUFFER_END while intent is play emits exactly one reassertFocus', () => {
    const start = playing();
    const out = run(
      [
        { type: 'BUFFER_START' },
        { type: 'BUFFER_END' },
        { type: 'BUFFER_START' },
        { type: 'BUFFER_END' },
      ],
      start.state,
      start.ctx,
    );
    expect(only(out.effects, 'reassertFocus')).toHaveLength(2);
    // And a BUFFER_END with nothing buffering is not an excuse to emit one.
    expect(run([{ type: 'BUFFER_END' }], out.state, out.ctx).effects).toEqual([]);
  });

  it('4. savePosition fires on PAUSE, on SEEK and on APP_BACKGROUND', () => {
    const start = playing();
    for (const event of [
      { type: 'PAUSE' } as const,
      { type: 'SEEK', toMs: 10_000 } as const,
      { type: 'APP_BACKGROUND' } as const,
    ]) {
      const out = run([event], start.state, start.ctx);
      expect(kinds(out.effects)).toContain('savePosition');
    }
  });

  it('5. finished is true iff the end was reached, skipped past, or within 30 s', () => {
    const start = playing();

    const reachedEnd = run([{ type: 'ENDED' }], start.state, start.ctx);
    expect(only(reachedEnd.effects, 'savePosition')[0]?.finished).toBe(true);
    expect(reachedEnd.state.kind).toBe('ended');

    const skippedPast = run([{ type: 'SEEK', toMs: HOUR + 5_000 }], start.state, start.ctx);
    expect(only(skippedPast.effects, 'savePosition')[0]).toMatchObject({
      offsetMs: HOUR,
      finished: true,
    });
    expect(skippedPast.state.kind).toBe('ended');

    const wellShort = run([{ type: 'SEEK', toMs: HOUR - 31_000 }], start.state, start.ctx);
    expect(only(wellShort.effects, 'savePosition')[0]?.finished).toBe(false);

    // The boundary belongs in the reducer's own suite too, not only in
    // finished.test.ts: an off-by-one here is what decides whether someone
    // is offered an episode again or told they have heard it.
    const exactly30 = run([{ type: 'SEEK', toMs: HOUR - 30_000 }], start.state, start.ctx);
    expect(only(exactly30.effects, 'savePosition')[0]?.finished).toBe(true);
    const oneMsShort = run([{ type: 'SEEK', toMs: HOUR - 30_001 }], start.state, start.ctx);
    expect(only(oneMsShort.effects, 'savePosition')[0]?.finished).toBe(false);
  });

  it('6. a LOADED whose loadId is stale changes nothing and emits nothing', () => {
    const loading = run([load()]);
    const stale = run([{ type: 'LOADED', loadId: 99, durationMs: HOUR }], loading.state, loading.ctx);
    expect(stale.state).toEqual(loading.state);
    expect(stale.effects).toEqual([]);
  });

  it('7. an ERROR while playing notifies only on the fourth, never the first', () => {
    const start = playing();
    const first = run([{ type: 'ERROR', message: 'x' }], start.state, start.ctx);
    expect(kinds(first.effects)).not.toContain('notify');
    expect(kinds(first.effects)).toContain('scheduleRetry');
    expect(first.state.kind).toBe('loading');
  });
});

// ---------------------------------------------------------------------------
// The rest of the table, so that every branch is exercised (SC-010)
// ---------------------------------------------------------------------------

describe('loading and restore', () => {
  it('LOAD saves the session with the listener\'s intent', () => {
    const out = run([load({ intent: 'pause' })]);
    expect(only(out.effects, 'saveSession')[0]).toEqual({
      kind: 'saveSession',
      episodeId: 'e1',
      intent: 'pause',
    });
  });

  it('LOADED with intent pause lands paused and does NOT play (Story 3)', () => {
    const out = run([load({ intent: 'pause', startMs: 872_000 }), { type: 'LOADED', loadId: 1 }]);
    expect(out.state).toMatchObject({ kind: 'paused', by: 'user', positionMs: 872_000 });
    expect(kinds(out.effects)).not.toContain('play');
    expect(kinds(out.effects)).not.toContain('setLockScreen');
  });

  it('LOADED sets the lock screen BEFORE play (gate item 1)', () => {
    const out = run([load(), { type: 'LOADED', loadId: 1, durationMs: HOUR }]);
    const order = kinds(out.effects);
    expect(order.indexOf('setLockScreen')).toBeLessThan(order.indexOf('play'));
  });

  it('LOADED outside a load is ignored', () => {
    const out = run([{ type: 'LOADED', loadId: 1 }]);
    expect(out.state).toEqual(INITIAL_STATE);
    expect(out.effects).toEqual([]);
  });

  it('RETRY_DUE outside a load is ignored', () => {
    const start = playing();
    expect(run([{ type: 'RETRY_DUE' }], start.state, start.ctx).effects).toEqual([]);
  });
});

describe('play and pause', () => {
  it('PLAY on a finished episode restarts it from the beginning (FR-019)', () => {
    const start = playing();
    const ended = run([{ type: 'ENDED' }], start.state, start.ctx);
    const again = run([{ type: 'PLAY' }], ended.state, ended.ctx);

    expect(again.state).toMatchObject({ kind: 'playing', positionMs: 0 });
    expect(only(again.effects, 'seek')[0]).toEqual({ kind: 'seek', toMs: 0 });
    expect(kinds(again.effects)).toContain('play');
  });

  it('PLAY while already playing does nothing', () => {
    const start = playing();
    expect(run([{ type: 'PLAY' }], start.state, start.ctx).effects).toEqual([]);
  });

  it('PLAY from idle does nothing — there is no episode to play', () => {
    expect(run([{ type: 'PLAY' }]).effects).toEqual([]);
  });

  it('PAUSE from idle does nothing', () => {
    expect(run([{ type: 'PAUSE' }]).effects).toEqual([]);
  });

  it('PAUSE records the intent so a restart does not auto-play', () => {
    const start = playing();
    const out = run([{ type: 'PAUSE' }], start.state, start.ctx);
    expect(only(out.effects, 'saveSession')[0]).toMatchObject({ intent: 'pause' });
  });
});

describe('seeking', () => {
  it('SEEK from idle does nothing', () => {
    expect(run([{ type: 'SEEK', toMs: 100 }]).effects).toEqual([]);
  });

  it('SKIP from idle does nothing', () => {
    expect(run([{ type: 'SKIP', deltaMs: 30_000 }]).effects).toEqual([]);
  });

  it('seeks freely when the feed declared no duration', () => {
    const start = playingWithoutDuration();
    const out = run([{ type: 'SEEK', toMs: 9_999_999 }], start.state, start.ctx);
    expect(out.state).toMatchObject({ kind: 'playing', positionMs: 9_999_999 });
    expect(only(out.effects, 'savePosition')[0]).toMatchObject({ finished: false });
  });

  it('seeks while buffering, while paused and while yielded', () => {
    const start = playing();

    const buffering = run([{ type: 'BUFFER_START' }], start.state, start.ctx);
    expect(run([{ type: 'SEEK', toMs: 50 }], buffering.state, buffering.ctx).state).toMatchObject({
      kind: 'buffering',
      positionMs: 50,
    });

    const paused = run([{ type: 'PAUSE' }], start.state, start.ctx);
    expect(run([{ type: 'SEEK', toMs: 60 }], paused.state, paused.ctx).state).toMatchObject({
      kind: 'paused',
      positionMs: 60,
    });

    const yielded = run([{ type: 'EXTERNAL_PAUSE', at: 1 }], start.state, start.ctx);
    expect(run([{ type: 'SEEK', toMs: 70 }], yielded.state, yielded.ctx).state).toMatchObject({
      kind: 'yielded',
      positionMs: 70,
    });
  });
});

describe('ticking and buffering', () => {
  it('a TICK below the save threshold updates the position and saves nothing', () => {
    const start = playing();
    const out = run([{ type: 'TICK', positionMs: 4_999, durationMs: HOUR }], start.state, start.ctx);
    expect(out.effects).toEqual([]);
    expect(out.state).toMatchObject({ positionMs: 4_999 });
  });

  it('a TICK without a duration does not erase the one we have', () => {
    const start = playing();
    const out = run([{ type: 'TICK', positionMs: 6_000 }], start.state, start.ctx);
    expect(out.state).toMatchObject({ durationMs: HOUR });
    expect(only(out.effects, 'savePosition')[0]?.durationMs).toBe(HOUR);
  });

  it('a TICK reports a duration the feed never declared', () => {
    const start = playingWithoutDuration();
    const out = run([{ type: 'TICK', positionMs: 6_000, durationMs: 1_234 }], start.state, start.ctx);
    expect(out.state).toMatchObject({ durationMs: 1_234 });
  });

  it('ticks while buffering still advance and still save', () => {
    const start = playing();
    const buffering = run([{ type: 'BUFFER_START' }], start.state, start.ctx);
    const out = run(
      [{ type: 'TICK', positionMs: 10_000, durationMs: HOUR }],
      buffering.state,
      buffering.ctx,
    );
    expect(out.state).toMatchObject({ kind: 'buffering', positionMs: 10_000 });
    expect(kinds(out.effects)).toContain('savePosition');
  });

  it('a TICK while paused is ignored', () => {
    const start = playing();
    const paused = run([{ type: 'PAUSE' }], start.state, start.ctx);
    expect(run([{ type: 'TICK', positionMs: 99_000 }], paused.state, paused.ctx).effects).toEqual(
      [],
    );
  });

  it('BUFFER_START only applies to a playing session', () => {
    const start = playing();
    const paused = run([{ type: 'PAUSE' }], start.state, start.ctx);
    expect(run([{ type: 'BUFFER_START' }], paused.state, paused.ctx).state.kind).toBe('paused');
  });
});

describe('interruptions', () => {
  // SC-003: "resumes ... from within 2 seconds of where it stopped". The
  // last TICK can be a whole tick interval stale; `at` is where the player
  // actually stopped, from the same source.
  it('EXTERNAL_PAUSE saves where the player stopped, not the last tick', () => {
    const start = playing();
    const out = run(
      [
        { type: 'TICK', positionMs: 40_000, durationMs: HOUR },
        { type: 'EXTERNAL_PAUSE', at: 40_480 },
      ],
      start.state,
      start.ctx,
    );
    expect(only(out.effects, 'savePosition').at(-1)?.offsetMs).toBe(40_480);
    expect(out.state).toMatchObject({ kind: 'yielded', positionMs: 40_480, since: 40_480 });
  });

  it('EXTERNAL_PAUSE during a rebuffer still yields', () => {
    const start = playing();
    const buffering = run([{ type: 'BUFFER_START' }], start.state, start.ctx);
    const out = run([{ type: 'EXTERNAL_PAUSE', at: 5 }], buffering.state, buffering.ctx);
    expect(out.state).toMatchObject({ kind: 'yielded', since: 5 });
  });

  it('EXTERNAL_PAUSE while already paused changes nothing', () => {
    const start = playing();
    const paused = run([{ type: 'PAUSE' }], start.state, start.ctx);
    expect(run([{ type: 'EXTERNAL_PAUSE', at: 5 }], paused.state, paused.ctx).effects).toEqual([]);
  });

  it('OUTPUT_LOST from idle does nothing', () => {
    expect(run([{ type: 'OUTPUT_LOST' }]).effects).toEqual([]);
  });

  it('OUTPUT_LOST during a yield still pauses for the lost output', () => {
    const start = playing();
    const yielded = run([{ type: 'EXTERNAL_PAUSE', at: 1 }], start.state, start.ctx);
    const out = run([{ type: 'OUTPUT_LOST' }], yielded.state, yielded.ctx);
    expect(out.state).toMatchObject({ kind: 'paused', by: 'output-lost' });
  });

  it('RESUME_WATCH_EXPIRED outside a yield does nothing', () => {
    expect(run([{ type: 'RESUME_WATCH_EXPIRED' }]).effects).toEqual([]);
  });
});

describe('ending and failing', () => {
  it('ENDED from buffering still ends', () => {
    const start = playing();
    const buffering = run([{ type: 'BUFFER_START' }], start.state, start.ctx);
    const out = run([{ type: 'ENDED' }], buffering.state, buffering.ctx);
    expect(out.state.kind).toBe('ended');
    expect(kinds(out.effects)).toContain('clearLockScreen');
  });

  it('ENDED from idle does nothing', () => {
    expect(run([{ type: 'ENDED' }]).effects).toEqual([]);
  });

  it('an ERROR while loading to pause goes straight to error, with no retry', () => {
    const loading = run([load({ intent: 'pause' })]);
    const out = run([{ type: 'ERROR', message: 'x' }], loading.state, loading.ctx);
    expect(out.state.kind).toBe('error');
    expect(kinds(out.effects)).toContain('notify');
    expect(kinds(out.effects)).not.toContain('scheduleRetry');
    // Nothing positioned to save: loading has never reported a position.
    expect(kinds(out.effects)).not.toContain('savePosition');
  });

  it('an ERROR while loading to play retries without saving a position', () => {
    const loading = run([load({ startMs: 4_000 })]);
    const out = run([{ type: 'ERROR', message: 'x' }], loading.state, loading.ctx);
    expect(out.state).toMatchObject({ kind: 'loading', positionMs: 4_000 });
    expect(kinds(out.effects)).toEqual(['scheduleRetry']);
  });

  it('an ERROR from idle names no episode', () => {
    const out = run([{ type: 'ERROR', message: 'x' }]);
    expect(out.state).toEqual({
      kind: 'error',
      episodeId: undefined,
      message: PLAYBACK_FAILED_MESSAGE,
    });
  });

  it('an ERROR on top of an error stays an error', () => {
    const first = run([{ type: 'ERROR', message: 'x' }]);
    const second = run([{ type: 'ERROR', message: 'y' }], first.state, first.ctx);
    expect(second.state.kind).toBe('error');
  });
});

describe('app lifecycle', () => {
  it('APP_BACKGROUND from idle does nothing', () => {
    expect(run([{ type: 'APP_BACKGROUND' }]).effects).toEqual([]);
  });

  it('APP_FOREGROUND does nothing on its own', () => {
    const start = playing();
    const out = run([{ type: 'APP_FOREGROUND' }], start.state, start.ctx);
    expect(out.effects).toEqual([]);
    expect(out.state).toEqual(start.state);
  });
});

// ---------------------------------------------------------------------------
// M3 (specs/002-m3-social-layer, T055): what each saved position says about itself
// ---------------------------------------------------------------------------

describe('M3 - savePosition carries explicitSeek and a reason', () => {
  const saves = (r: Run) => only(r.effects, 'savePosition').map((e) => [e.reason, e.explicitSeek, e.offsetMs] as const);

  it('SEEK and SKIP are explicit; a tick, a pause, the end, and backgrounding are not', () => {
    const p = playing(10_000);
    const r = run(
      [
        { type: 'SEEK', toMs: 872_000 },
        { type: 'SKIP', deltaMs: 30_000 },
        { type: 'TICK', positionMs: 910_000 },
        { type: 'PAUSE' },
        { type: 'APP_BACKGROUND' },
      ],
      p.state,
      p.ctx,
    );
    expect(saves(r)).toEqual([
      ['seek', true, 872_000],
      ['seek', true, 902_000],
      ['tick', false, 910_000],
      ['stop', false, 910_000],
      ['background', false, 910_000],
    ]);
  });

  it('skipping past the end is an explicit finish; reaching the end is not explicit', () => {
    const p = playing(HOUR - 1_000);
    const past = run([{ type: 'SKIP', deltaMs: 30_000 }], p.state, p.ctx);
    expect(saves(past)).toEqual([['finished', true, HOUR]]);
    const q = playing(HOUR - 1_000);
    const ended = run([{ type: 'ENDED' }], q.state, q.ctx);
    expect(saves(ended)).toEqual([['finished', false, HOUR - 1_000]]);
  });

  it('a call and a lost output save as stops', () => {
    const p = playing(5_000);
    const r = run([{ type: 'EXTERNAL_PAUSE', at: 5_000 }, { type: 'EXTERNAL_RESUME' }, { type: 'OUTPUT_LOST' }], p.state, p.ctx);
    expect(saves(r).map(([reason]) => reason)).toEqual(['stop', 'stop']);
  });
});

// ---------------------------------------------------------------------------
// M2 (specs/003-m2-real-client, T006): the playback rate
// ---------------------------------------------------------------------------

describe('M2 - SET_RATE and its re-application on LOADED (quickstart A11)', () => {
  it('SET_RATE stores the rate and emits setRate; every LOADED re-emits it before play', () => {
    const p = playing(0);
    const set = run([{ type: 'SET_RATE', rate: 1.5 }], p.state, p.ctx);
    expect(set.ctx.rate).toBe(1.5);
    expect(only(set.effects, 'setRate')).toEqual([{ kind: 'setRate', rate: 1.5 }]);
    // A new load: the fresh player starts at 1×, so the rate is re-applied.
    const reloaded = run([load({ startMs: 0 }), { type: 'LOADED', loadId: 2, durationMs: HOUR }], set.state, set.ctx);
    const k = kinds(reloaded.effects);
    expect(k.indexOf('setRate')).toBeGreaterThan(k.indexOf('setLockScreen'));
    expect(k.indexOf('setRate')).toBeLessThan(k.lastIndexOf('play'));
    expect(only(reloaded.effects, 'setRate').pop()).toEqual({ kind: 'setRate', rate: 1.5 });
  });

  it('a LOADED with intent pause also re-applies the rate', () => {
    const set = run([{ type: 'SET_RATE', rate: 2 }]);
    const r = run([{ ...load({ startMs: 5_000 }), intent: 'pause' } as PlayerEvent, { type: 'LOADED', loadId: 1, durationMs: HOUR }], set.state, set.ctx);
    expect(r.state.kind).toBe('paused');
    expect(only(r.effects, 'setRate')).toEqual([{ kind: 'setRate', rate: 2 }]);
  });
});
