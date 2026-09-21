/**
 * The player state machine (data-model.md § Player state machine).
 *
 * PURE. No imports from expo, react or the stores — see `types.ts` for why
 * that rule is load-bearing rather than tidy. Everything the machine wants
 * the world to do comes back as an `Effect` for the adapter to run; the
 * reducer never touches a player, a timer or a database.
 *
 * The reason all of this lives here rather than in the adapter is
 * expo/expo#50072 and the fact that `expo-audio` exposes no interruption
 * event at all: the only signal that a call arrived is a `playing: false`
 * we did not ask for. A machine we own can be tested; trusting the library's
 * focus handling cannot.
 */
import { isFinished } from './finished';
import {
  MAX_RETRIES,
  PLAYBACK_FAILED_MESSAGE,
  RESUME_WATCH_MS,
  RETRY_BASE_MS,
  RETRY_CAP_MS,
  SAVE_EVERY_MS,
  type Effect,
  type Ms,
  type PlayerContext,
  type PlayerEvent,
  type PlayerState,
  type SaveReason,
} from './types';

export type Reduction = { state: PlayerState; ctx: PlayerContext; effects: Effect[] };

/** The four states that know where the listener is. */
type PositionedState = Extract<
  PlayerState,
  { kind: 'playing' | 'buffering' | 'paused' | 'yielded' }
>;

function isPositioned(state: PlayerState): state is PositionedState {
  return (
    state.kind === 'playing' ||
    state.kind === 'buffering' ||
    state.kind === 'paused' ||
    state.kind === 'yielded'
  );
}

/** The three states that carry an episode the listener asked to hear. */
type PlayIntentState = Extract<PlayerState, { kind: 'playing' | 'buffering' | 'loading' }>;

/** Intent is "play" whenever the session is meant to be producing audio. */
function intentIsPlay(state: PlayerState): state is PlayIntentState {
  if (state.kind === 'playing' || state.kind === 'buffering') return true;
  if (state.kind === 'loading') return state.intent === 'play';
  return false;
}

function episodeIdOf(state: PlayerState): string | undefined {
  return state.kind === 'idle' ? undefined : state.episodeId;
}

function savePosition(state: PositionedState, reachedEnd: boolean, reason: SaveReason, explicitSeek = false): Effect {
  return {
    kind: 'savePosition',
    episodeId: state.episodeId,
    offsetMs: state.positionMs,
    durationMs: state.durationMs,
    finished: isFinished(state.positionMs, state.durationMs, reachedEnd),
    explicitSeek,
    reason,
  };
}

function withPosition(state: PositionedState, positionMs: Ms): PositionedState {
  switch (state.kind) {
    case 'playing':
    case 'buffering':
      // `lastSavedMs` moves with it: every path that repositions also saves,
      // so leaving it behind would make the next TICK save immediately.
      return { ...state, positionMs, lastSavedMs: positionMs };
    case 'paused':
      return { ...state, positionMs };
    case 'yielded':
      return { ...state, positionMs };
  }
}

/** SEEK and SKIP are the same move; SKIP just computes its target first. */
function seekTo(state: PlayerState, ctx: PlayerContext, toMs: Ms): Reduction {
  if (!isPositioned(state)) return { state, ctx, effects: [] };
  // Skip-back on a 10-second episode clamps to 0 rather than going negative.
  const target = Math.max(0, toMs);
  const { durationMs } = state;

  if (durationMs !== undefined && target >= durationMs) {
    // FR-019: skipping past the end finishes the episode. It does not seek
    // to a position that does not exist and wait for the player to complain.
    const at: PositionedState = withPosition(state, durationMs);
    return {
      state: { kind: 'ended', episodeId: state.episodeId, durationMs },
      ctx,
      effects: [
        { kind: 'seek', toMs: durationMs },
        savePosition(at, true, 'finished', true),
        { kind: 'clearLockScreen' },
      ],
    };
  }

  const moved = withPosition(state, target);
  return {
    state: moved,
    ctx,
    effects: [{ kind: 'seek', toMs: target }, savePosition(moved, false, 'seek', true)],
  };
}

function fail(state: PlayerState, ctx: PlayerContext): Reduction {
  const effects: Effect[] = [{ kind: 'notify', message: PLAYBACK_FAILED_MESSAGE }];
  if (isPositioned(state)) effects.push(savePosition(state, false, 'other'));
  effects.push({ kind: 'clearLockScreen' });
  return {
    state: {
      kind: 'error',
      episodeId: episodeIdOf(state),
      message: PLAYBACK_FAILED_MESSAGE,
      // A retry that fails does so from `loading`, which also knows where it
      // was trying to resume; keep it, or "Try again" restarts from zero.
      ...(isPositioned(state) || state.kind === 'loading' ? { positionMs: state.positionMs } : {}),
    },
    ctx,
    effects,
  };
}

export function reduce(state: PlayerState, event: PlayerEvent, ctx: PlayerContext): Reduction {
  switch (event.type) {
    case 'LOAD': {
      // A fresh loadId on every LOAD is what makes a LOADED from the
      // abandoned episode identifiable, and therefore ignorable (A12).
      const loadId = ctx.loadId + 1;
      return {
        state: {
          kind: 'loading',
          episodeId: event.episodeId,
          loadId,
          intent: event.intent,
          positionMs: event.startMs,
          url: event.url,
        },
        ctx: { loadId, retries: 0, url: event.url, meta: event.meta, rate: ctx.rate },
        effects: [
          { kind: 'load', url: event.url, startMs: event.startMs },
          { kind: 'saveSession', episodeId: event.episodeId, intent: event.intent },
        ],
      };
    }

    case 'LOADED': {
      if (state.kind !== 'loading') return { state, ctx, effects: [] };
      // Invariant 6: a LOADED for a load we have already abandoned changes
      // nothing and emits nothing. Without this, tapping two episodes quickly
      // starts the first one over the second.
      if (event.loadId !== state.loadId) return { state, ctx, effects: [] };

      const settled = { ...ctx, retries: 0 };
      if (state.intent === 'pause') {
        // Restore never auto-plays (spec Assumptions, Story 3).
        return {
          state: {
            kind: 'paused',
            episodeId: state.episodeId,
            positionMs: state.positionMs,
            durationMs: event.durationMs,
            by: 'user',
          },
          ctx: settled,
          // M2: a fresh player starts at 1×; the remembered rate is re-applied (research R2).
          effects: [{ kind: 'setRate', rate: ctx.rate }],
        };
      }
      return {
        state: {
          kind: 'playing',
          episodeId: state.episodeId,
          positionMs: state.positionMs,
          durationMs: event.durationMs,
          lastSavedMs: state.positionMs,
        },
        ctx: settled,
        // setLockScreen FIRST, and this order is not cosmetic. On Android
        // sustained background playback is contingent on the lock-screen
        // controls being active; without them audio stops at about three
        // minutes, quietly, and gate item 1 (10 minutes locked) fails looking
        // like a battery problem. See docs/M1-AUDIO-RISKS.md gap 1.
        // M2: setRate before play so the first audible second is already at speed.
        effects: [{ kind: 'setLockScreen', meta: ctx.meta }, { kind: 'setRate', rate: ctx.rate }, { kind: 'play' }],
      };
    }

    case 'SET_RATE': {
      // M2 (FR-012): remembered in the context so every later LOADED re-applies it.
      return { state, ctx: { ...ctx, rate: event.rate }, effects: [{ kind: 'setRate', rate: event.rate }] };
    }

    case 'RETRY_DUE': {
      if (state.kind !== 'loading') return { state, ctx, effects: [] };
      return {
        state,
        ctx,
        effects: [
          { kind: 'load', url: state.url, startMs: state.positionMs },
          { kind: 'play' },
        ],
      };
    }

    case 'PLAY': {
      if (state.kind === 'ended') {
        // FR-019: a finished episode offered again starts from the beginning.
        return {
          state: {
            kind: 'playing',
            episodeId: state.episodeId,
            positionMs: 0,
            durationMs: state.durationMs,
            lastSavedMs: 0,
          },
          ctx: { ...ctx, retries: 0 },
          effects: [
            { kind: 'seek', toMs: 0 },
            { kind: 'setLockScreen', meta: ctx.meta },
            { kind: 'play' },
            { kind: 'saveSession', episodeId: state.episodeId, intent: 'play' },
          ],
        };
      }
      if (state.kind === 'paused' || state.kind === 'yielded') {
        // The listener asking for audio always wins, including out of a
        // yield and out of an output-lost pause. Invariants 1 and 2 forbid
        // the machine resuming those by itself, not the listener doing it.
        return {
          state: {
            kind: 'playing',
            episodeId: state.episodeId,
            positionMs: state.positionMs,
            durationMs: state.durationMs,
            lastSavedMs: state.positionMs,
          },
          ctx: { ...ctx, retries: 0 },
          effects: [
            { kind: 'setLockScreen', meta: ctx.meta },
            { kind: 'play' },
            { kind: 'saveSession', episodeId: state.episodeId, intent: 'play' },
          ],
        };
      }
      if (state.kind === 'error' && state.episodeId !== undefined) {
        // "Try again" (FR-015). Watched doing nothing on the phone on
        // 2026-09-20: this branch returned no effects, so the button was dead.
        // A fresh load at the position we failed at, with the retry budget back.
        const loadId = ctx.loadId + 1;
        const positionMs = state.positionMs ?? 0;
        return {
          state: { kind: 'loading', episodeId: state.episodeId, loadId, intent: 'play', positionMs, url: ctx.url },
          ctx: { ...ctx, loadId, retries: 0 },
          effects: [
            { kind: 'load', url: ctx.url, startMs: positionMs },
            { kind: 'setLockScreen', meta: ctx.meta },
            { kind: 'play' },
            { kind: 'saveSession', episodeId: state.episodeId, intent: 'play' },
          ],
        };
      }
      return { state, ctx, effects: [] };
    }

    case 'PAUSE': {
      if (!isPositioned(state)) return { state, ctx, effects: [] };
      // Invariant 4: every PAUSE saves. This is the "exact after a pause"
      // half of SC-005.
      return {
        state: {
          kind: 'paused',
          episodeId: state.episodeId,
          positionMs: state.positionMs,
          durationMs: state.durationMs,
          by: 'user',
        },
        ctx,
        effects: [
          { kind: 'pause' },
          savePosition(state, false, 'stop'),
          { kind: 'saveSession', episodeId: state.episodeId, intent: 'pause' },
        ],
      };
    }

    case 'SEEK':
      return seekTo(state, ctx, event.toMs);

    case 'SKIP': {
      if (!isPositioned(state)) return { state, ctx, effects: [] };
      return seekTo(state, ctx, state.positionMs + event.deltaMs);
    }

    case 'TICK': {
      if (state.kind !== 'playing' && state.kind !== 'buffering') {
        return { state, ctx, effects: [] };
      }
      const advanced = {
        ...state,
        positionMs: event.positionMs,
        // A duration the player reports is worth more than one the feed
        // declared, but a tick without one must not erase what we have.
        durationMs: event.durationMs ?? state.durationMs,
      };
      if (event.positionMs - state.lastSavedMs >= SAVE_EVERY_MS) {
        const saved = { ...advanced, lastSavedMs: event.positionMs };
        return { state: saved, ctx, effects: [savePosition(saved, false, 'tick')] };
      }
      return { state: advanced, ctx, effects: [] };
    }

    case 'BUFFER_START': {
      if (state.kind !== 'playing') return { state, ctx, effects: [] };
      return { state: { ...state, kind: 'buffering' }, ctx, effects: [] };
    }

    case 'BUFFER_END': {
      if (state.kind !== 'buffering') return { state, ctx, effects: [] };
      // Invariant 3 and the whole reason for SC-007's ordering. Android
      // releases audio focus on any non-playing transition, buffering
      // included, and only re-requests it inside play() — so a stream that
      // healed itself is running with no focus and will talk straight over
      // the next phone call (expo/expo#50072).
      return {
        state: { ...state, kind: 'playing' },
        ctx,
        effects: [{ kind: 'reassertFocus' }],
      };
    }

    case 'EXTERNAL_PAUSE': {
      if (state.kind !== 'playing' && state.kind !== 'buffering') {
        return { state, ctx, effects: [] };
      }
      // We cannot tell a call from a music app taking over: expo-audio gives
      // us one signal for both. So assume transient, and let the resume watch
      // decide (FR-011a).
      //
      // `event.at` is where the player actually stopped, read from the same
      // `status.currentTime` the ticks come from but FRESHER — a tick may be
      // up to its own interval old. SC-003 asks for resume within 2 seconds
      // of where it stopped, so the saved position uses it rather than the
      // last tick.
      const at: PositionedState = withPosition(state, event.at);
      return {
        state: {
          kind: 'yielded',
          episodeId: at.episodeId,
          positionMs: at.positionMs,
          durationMs: at.durationMs,
          since: event.at,
        },
        ctx,
        effects: [savePosition(at, false, 'stop'), { kind: 'startResumeWatch', ms: RESUME_WATCH_MS }],
      };
    }

    case 'EXTERNAL_RESUME': {
      // Invariant 2: only `yielded` accepts this. An output-lost pause never
      // becomes playing without the listener, or a bluetooth speaker powering
      // off ends with the episode blaring from the phone (FR-012).
      if (state.kind !== 'yielded') return { state, ctx, effects: [] };
      return {
        state: {
          kind: 'playing',
          episodeId: state.episodeId,
          positionMs: state.positionMs,
          durationMs: state.durationMs,
          lastSavedMs: state.positionMs,
        },
        ctx,
        effects: [{ kind: 'reassertFocus' }],
      };
    }

    case 'OUTPUT_LOST': {
      if (!isPositioned(state)) return { state, ctx, effects: [] };
      return {
        state: {
          kind: 'paused',
          episodeId: state.episodeId,
          positionMs: state.positionMs,
          durationMs: state.durationMs,
          by: 'output-lost',
        },
        ctx,
        effects: [{ kind: 'pause' }, savePosition(state, false, 'stop')],
      };
    }

    case 'RESUME_WATCH_EXPIRED': {
      if (state.kind !== 'yielded') return { state, ctx, effects: [] };
      // Invariant 1. FR-011a: nothing came back, so it was a takeover, not a
      // call. Stay paused, and emit NO play effect. The listener presses play.
      return {
        state: {
          kind: 'paused',
          episodeId: state.episodeId,
          positionMs: state.positionMs,
          durationMs: state.durationMs,
          by: 'user',
        },
        ctx,
        effects: [],
      };
    }

    case 'ENDED': {
      if (state.kind !== 'playing' && state.kind !== 'buffering') {
        return { state, ctx, effects: [] };
      }
      return {
        state: { kind: 'ended', episodeId: state.episodeId, durationMs: state.durationMs },
        ctx,
        effects: [savePosition(state, true, 'finished'), { kind: 'clearLockScreen' }],
      };
    }

    case 'ERROR': {
      if (!intentIsPlay(state) || ctx.retries >= MAX_RETRIES) {
        return fail(state, ctx);
      }
      // FR-013 / SC-006: a 30-second tunnel is survivable. Reload at the last
      // known position and back off 2 s, 4 s, 8 s before admitting defeat.
      const effects: Effect[] = [];
      if (isPositioned(state)) effects.push(savePosition(state, false, 'other'));
      effects.push({ kind: 'scheduleRetry', ms: Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** ctx.retries) });
      return {
        state: {
          kind: 'loading',
          episodeId: state.episodeId,
          loadId: ctx.loadId,
          intent: 'play',
          positionMs: state.positionMs,
          url: ctx.url,
        },
        ctx: { ...ctx, retries: ctx.retries + 1 },
        effects,
      };
    }

    case 'APP_BACKGROUND': {
      // FR-016: the app going away is one of the three moments a position
      // must be written, alongside pause and seek.
      if (!isPositioned(state)) return { state, ctx, effects: [] };
      return { state, ctx, effects: [savePosition(state, false, 'background')] };
    }

    case 'APP_FOREGROUND':
      // Nothing to do: the player kept running, and the next TICK carries
      // whatever the position now is.
      return { state, ctx, effects: [] };
  }
}
