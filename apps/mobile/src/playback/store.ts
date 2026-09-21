/**
 * Binding: reducer <-> adapter <-> storage.
 *
 * Split in two on purpose. `createPlayerRuntime` is plain TypeScript with no
 * React in it, so every effect route — including the two timers, which are
 * the difference between "resumes after a call" and "stays silent forever" —
 * is testable with fake timers and a fake adapter. The React context below it
 * is a wrapper and nothing more.
 */
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { reconcileOffset } from './finished';
import { reduce } from './reducer';
import { armTimer, clampRate, nextPlayable, rateFor, remove as removeFromQueue, timerFired, timerRemainingMs, type SleepChoice, type SleepTimer } from '@socialmorning/player-core';
import {
  INITIAL_CONTEXT,
  INITIAL_STATE,
  type Effect,
  type Ms,
  type PlayerContext,
  type PlayerEvent,
  type PlayerState,
  type SaveReason,
} from './types';
import type { AdapterEvent, AudioAdapter } from './expo-audio-adapter';
import type { PositionRow, Stores } from '../storage/types';

/** What a screen hands the player. Deliberately not a storage row. */
export type PlayableEpisode = {
  id: string;
  url: string;
  title: string;
  showTitle: string;
  artworkUrl?: string;
  durationMs?: Ms;
  /** M2 (FR-013): which show's speed preference applies. */
  feedUrl?: string;
};

export type PlayerDeps = {
  adapter: AudioAdapter;
  stores: Stores;
  now: () => number;
  /** FR-015: shown to the listener. Wired to the toast host in _layout. */
  notify: (message: string) => void;
  /** M3: called after every saved position with why it was saved (research R9). */
  onPositionSaved?: (row: PositionRow, reason: SaveReason) => void;
  /**
   * M2 (FR-009/010, research R7): how the runtime advances the queue when an episode
   * ends. `lookup` turns a queued id into something playable (toPlayable);
   * `online` decides whether undownloaded items may play; `onSkipped` is told about
   * items passed over offline. Absent → no queue behaviour (M1/M3 tests).
   */
  advance?: {
    lookup: (episodeId: string) => PlayableEpisode | undefined;
    online: () => boolean;
    onSkipped?: (episodeId: string) => void;
  };
  /** M4 (research R3): every TICK's episode time, for the listened-interval accumulator. Kept out of the reducer. */
  onTick?: (episodeId: string, positionMs: Ms) => void;
};

export type PlayerRuntime = {
  getState: () => PlayerState;
  subscribe: (listener: () => void) => () => void;
  load: (episode: PlayableEpisode, intent: 'play' | 'pause') => void;
  play: () => void;
  pause: () => void;
  seek: (toMs: Ms) => void;
  skip: (deltaMs: 30_000 | -15_000) => void;
  /** M2 (FR-012): rate already clamped by player-core. */
  setRate: (rate: number) => void;
  /** M2 (FR-016): the sleep timer's "end of episode" — the next `ended` does not advance the queue. */
  holdNextAdvance: (hold: boolean) => void;
  /** M2 (FR-015..017): set, change or cancel the sleep timer. */
  setSleepTimer: (choice: SleepChoice) => void;
  sleepTimer: () => SleepTimer;
  sleepRemainingMs: () => number | undefined;
  /** M2 (FR-013): the rate in force, and the app-wide default. */
  rate: () => number;
  setDefaultRate: (rate: number) => void;
  defaultRate: () => number;
  /** Cold start: put back what the listener was on, PAUSED. */
  restore: (lookup: (episodeId: string) => PlayableEpisode | undefined) => void;
  /** Where this episode should start, honouring FR-019 and FR-020. */
  startPositionFor: (episode: PlayableEpisode) => Ms;
  /**
   * M4 (FR-003, research R7): play a clip — load the episode, seek to `startMs` as an
   * explicit seek once it has loaded, and pause at `endMs`. The end is watched on every
   * TICK, the mechanism M2's D3 proved fires with the screen locked. Any Play, seek,
   * skip or load clears the watch; "keep listening" is a plain Play.
   */
  playClip: (episode: PlayableEpisode, range: { startMs: Ms; endMs: Ms }) => void;
  clip: () => { episodeId: string; startMs: Ms; endMs: Ms } | undefined;
  dispose: () => void;
};

export function createPlayerRuntime(deps: PlayerDeps): PlayerRuntime {
  let state: PlayerState = INITIAL_STATE;
  let ctx: PlayerContext = INITIAL_CONTEXT;
  const listeners = new Set<() => void>();

  let resumeWatch: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let holdAdvance = false;
  let sleep: SleepTimer = { kind: 'off' };
  let sleepTimeout: ReturnType<typeof setTimeout> | undefined;
  // M4 clip mode: the range being played, and the loadId whose LOADED must seek to its start.
  let clip: { episodeId: string; startMs: Ms; endMs: Ms } | undefined;
  let clipSeekPending: { loadId: number; toMs: Ms } | undefined;
  let currentFeedUrl: string | undefined;

  const SPEED_DEFAULT_KEY = 'speed.default';
  const defaultRate = () => clampRate(Number(deps.stores.settings.get(SPEED_DEFAULT_KEY) ?? 1));

  /**
   * M2 sleep timer. Research R4 said a JS timeout would fire with the screen locked;
   * the phone said otherwise (D3 FAILED 2026-09-21: still playing 6 min after a 5-min
   * timer — React Native pauses JS timers in the background). What DOES keep arriving
   * while locked is the native player's TICK (M1 row 1 saved positions for 10 min that
   * way), so the deadline is checked on every TICK — that is the guarantee. The
   * timeout stays for foreground precision. Firing: PAUSE where we are, timer off. An
   * interruption's pause is not the timer's pause and does not reset it (FR-017).
   */
  function scheduleSleep(): void {
    clearTimeout(sleepTimeout);
    sleepTimeout = undefined;
    const remaining = timerRemainingMs(sleep, deps.now());
    if (remaining === undefined) return;
    sleepTimeout = setTimeout(() => {
      sleepTimeout = undefined;
      sleep = { kind: 'off' };
      dispatch({ type: 'PAUSE' });
    }, remaining);
  }

  /**
   * M2 queue advance (research R7). Runs only on a transition INTO `ended`, and only
   * when nothing asked it to hold (the sleep timer's end-of-episode). Direct loads
   * never touch the queue (Q1) — this is the single place that consumes it.
   */
  function advanceQueue(): void {
    const adv = deps.advance;
    if (!adv) return;
    if (holdAdvance) { holdAdvance = false; return; }
    const queue = deps.stores.queue.list();
    const { next, skipped } = nextPlayable(queue, deps.stores.downloads.list(), adv.online());
    for (const id of skipped) adv.onSkipped?.(id);
    if (!next) return;
    const episode = adv.lookup(next);
    // The chosen item leaves the queue whether or not it can be described; a row
    // whose episode vanished from the feed must not block the queue forever.
    deps.stores.queue.replace(removeFromQueue(queue, next), deps.now());
    if (!episode) { advanceQueue(); return; }
    load(episode, 'play');
  }

  function runEffect(effect: Effect): void {
    switch (effect.kind) {
      case 'savePosition': {
        const row = deps.stores.positions.save(
          {
            episodeId: effect.episodeId,
            offsetMs: effect.offsetMs,
            durationMsAtSave: effect.durationMs,
            finished: effect.finished,
            explicitSeek: effect.explicitSeek,
          },
          deps.now(),
        );
        // M3: the position sync decides whether this is an "upload now" moment (R9).
        deps.onPositionSaved?.(row, effect.reason);
        return;
      }
      case 'saveSession':
        deps.stores.session.set(
          { episodeId: effect.episodeId, intent: effect.intent },
          deps.now(),
        );
        return;
      case 'startResumeWatch':
        clearTimeout(resumeWatch);
        resumeWatch = setTimeout(() => dispatch({ type: 'RESUME_WATCH_EXPIRED' }), effect.ms);
        return;
      case 'scheduleRetry':
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => dispatch({ type: 'RETRY_DUE' }), effect.ms);
        return;
      case 'notify':
        deps.notify(effect.message);
        return;
      default:
        // Everything that touches the player itself.
        void deps.adapter.execute(effect);
        return;
    }
  }

  function dispatch(event: AdapterEvent): void {
    // The adapter cannot know the reducer's loadId, so it is stamped here,
    // at the only place that holds the current one. A12 depends on this.
    const full: PlayerEvent =
      event.type === 'LOADED' ? { ...event, loadId: ctx.loadId } : event;

    // A drifted background timer is re-armed with what is left. Firing already sets
    // the timer off, which is what makes "Play afterwards" clear it (FR-016).
    if (full.type === 'APP_FOREGROUND') scheduleSleep();
    // The lock-screen-proof path: the native player ticks even when JS timers do not.
    if (full.type === 'TICK' && timerFired(sleep, deps.now())) {
      clearTimeout(sleepTimeout);
      sleepTimeout = undefined;
      sleep = { kind: 'off' };
      dispatch({ type: 'PAUSE' });
      return;
    }
    // M4 clip mode: the end is a TICK fact, like the sleep timer. Reaching it pauses once.
    if (full.type === 'TICK' && clip !== undefined && full.positionMs >= clip.endMs) {
      clip = undefined;
      dispatch({ type: 'PAUSE' });
      return;
    }
    // A listener's own Play / seek / skip / load leaves clip mode; the pause we dispatch does not.
    if (clip !== undefined && (full.type === 'PLAY' || full.type === 'SEEK' || full.type === 'SKIP' || full.type === 'LOAD')) clip = undefined;
    // M4 (research R3): the listened-interval accumulator hears every TICK in episode time.
    if (full.type === 'TICK' && 'episodeId' in state && typeof state.episodeId === 'string') deps.onTick?.(state.episodeId, full.positionMs);
    const next = reduce(state, full, ctx);
    const wasEnded = state.kind === 'ended';
    state = next.state;
    ctx = next.ctx;
    for (const effect of next.effects) runEffect(effect);
    for (const listener of listeners) listener();
    if (!wasEnded && state.kind === 'ended') advanceQueue();
    // The clip's start is an explicit seek (M3 R5 rule 2: the listener chose a place),
    // issued once the load it belongs to has actually loaded.
    if (full.type === 'LOADED' && clipSeekPending !== undefined && clipSeekPending.loadId === full.loadId) {
      const toMs = clipSeekPending.toMs;
      clipSeekPending = undefined;
      const keep = clip;
      dispatch({ type: 'SEEK', toMs });
      clip = keep;
    }
  }

  function startPositionFor(episode: PlayableEpisode): Ms {
    const row = deps.stores.positions.get(episode.id);
    if (row === undefined) return 0;
    // FR-019: a finished episode is offered from the beginning, not from its
    // final seconds. FR-020: a position past the (new) end is reconciled.
    if (row.finished) return 0;
    const reconciled = reconcileOffset(row.offsetMs, episode.durationMs);
    return reconciled.finished ? 0 : reconciled.offsetMs;
  }

  function load(episode: PlayableEpisode, intent: 'play' | 'pause'): void {
    // M2 (FR-013): the show's remembered speed, else the app-wide default.
    currentFeedUrl = episode.feedUrl;
    const prefs = new Map<string, number>();
    if (episode.feedUrl !== undefined) {
      const pref = deps.stores.speed.get(episode.feedUrl);
      if (pref !== undefined) prefs.set(episode.feedUrl, pref);
    }
    const rate = rateFor(episode.feedUrl ?? '', prefs, defaultRate());
    if (rate !== ctx.rate) dispatch({ type: 'SET_RATE', rate });
    // FR-016: "end of episode" is for the episode it was set on; a new load clears it.
    if (sleep.kind === 'endOfEpisode') { sleep = { kind: 'off' }; holdAdvance = false; }
    dispatch({
      type: 'LOAD',
      episodeId: episode.id,
      url: episode.url,
      startMs: startPositionFor(episode),
      intent,
      meta: {
        title: episode.title,
        artist: episode.showTitle,
        ...(episode.artworkUrl !== undefined && { artworkUrl: episode.artworkUrl }),
      },
    });
  }

  function restore(lookup: (episodeId: string) => PlayableEpisode | undefined): void {
    const session = deps.stores.session.get();
    if (session?.episodeId === undefined) return;
    const episode = lookup(session.episodeId);
    if (episode === undefined) return;
    // Always 'pause'. "Resumes at 14:32" means the position is restored and
    // continues on play, not that audio starts by itself (spec Assumptions).
    load(episode, 'pause');
  }

  const unsubscribe = deps.adapter.subscribe(dispatch);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    play: () => dispatch({ type: 'PLAY' }),
    pause: () => dispatch({ type: 'PAUSE' }),
    seek: (toMs) => dispatch({ type: 'SEEK', toMs }),
    skip: (deltaMs) => dispatch({ type: 'SKIP', deltaMs }),
    setRate: (rate) => {
      const clamped = clampRate(rate);
      dispatch({ type: 'SET_RATE', rate: clamped });
      if (currentFeedUrl !== undefined) deps.stores.speed.set(currentFeedUrl, clamped);
    },
    rate: () => ctx.rate,
    setDefaultRate: (rate) => deps.stores.settings.set(SPEED_DEFAULT_KEY, String(clampRate(rate))),
    defaultRate,
    holdNextAdvance: (hold) => { holdAdvance = hold; },
    setSleepTimer: (choice) => {
      sleep = armTimer(choice, deps.now());
      holdAdvance = sleep.kind === 'endOfEpisode';
      scheduleSleep();
      for (const listener of listeners) listener();
    },
    sleepTimer: () => sleep,
    sleepRemainingMs: () => timerRemainingMs(sleep, deps.now()),
    restore,
    startPositionFor,
    playClip(episode, range) {
      load(episode, 'play');
      clip = { episodeId: episode.id, startMs: range.startMs, endMs: range.endMs };
      clipSeekPending = { loadId: ctx.loadId, toMs: range.startMs };
      for (const listener of listeners) listener();
    },
    clip: () => clip,
    dispose() {
      clearTimeout(resumeWatch);
      clearTimeout(retryTimer);
      clearTimeout(sleepTimeout);
      unsubscribe();
    },
  };
}

// ---------------------------------------------------------------------------
// React binding — a wrapper, and nothing that decides anything.
// ---------------------------------------------------------------------------

const RuntimeContext = createContext<PlayerRuntime | undefined>(undefined);

export function PlayerProvider(props: {
  runtime: PlayerRuntime;
  children?: ReactNode;
}): ReactNode {
  return createElement(RuntimeContext.Provider, { value: props.runtime }, props.children);
}

export function usePlayer(): PlayerRuntime {
  const runtime = useContext(RuntimeContext);
  if (runtime === undefined) {
    throw new Error('usePlayer must be used inside a <PlayerProvider>');
  }
  return runtime;
}

export function usePlayerState(): PlayerState {
  const runtime = usePlayer();
  return useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState);
}
