/**
 * The pure player vocabulary (specs/001-m1-it-plays/contracts/playback.ts).
 *
 * Nothing in this file, or in `reducer.ts` and `finished.ts` beside it, may
 * import from expo or react. That is the whole point: FR-024 requires the
 * position and interruption logic to be exercisable without a device, and
 * SC-010 requires full branch coverage of it. An import of `expo-audio` here
 * would make both impossible and would not be noticed for weeks.
 */
export type Ms = number;

export type PlayerState =
  | { kind: 'idle' }
  | {
      kind: 'loading';
      episodeId: string;
      loadId: number;
      intent: 'play' | 'pause';
      positionMs: Ms;
      url: string;
    }
  | { kind: 'playing'; episodeId: string; positionMs: Ms; durationMs?: Ms; lastSavedMs: Ms }
  | { kind: 'buffering'; episodeId: string; positionMs: Ms; durationMs?: Ms; lastSavedMs: Ms }
  | {
      kind: 'paused';
      episodeId: string;
      positionMs: Ms;
      durationMs?: Ms;
      by: 'user' | 'output-lost';
    }
  | { kind: 'yielded'; episodeId: string; positionMs: Ms; durationMs?: Ms; since: Ms }
  | { kind: 'ended'; episodeId: string; durationMs?: Ms }
  | { kind: 'error'; episodeId?: string; message: string; positionMs?: Ms };

export type LockScreenMeta = { title: string; artist: string; artworkUrl?: string };

export type PlayerEvent =
  /** M2: set the playback rate (already clamped by player-core). */
  | { type: 'SET_RATE'; rate: number }
  | {
      type: 'LOAD';
      episodeId: string;
      url: string;
      startMs: Ms;
      intent: 'play' | 'pause';
      meta: LockScreenMeta;
    }
  /** Ignored unless `loadId` matches the load currently in flight. */
  | { type: 'LOADED'; loadId: number; durationMs?: Ms }
  /** The `scheduleRetry` timer fired. */
  | { type: 'RETRY_DUE' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SEEK'; toMs: Ms }
  | { type: 'SKIP'; deltaMs: 30_000 | -15_000 }
  | { type: 'TICK'; positionMs: Ms; durationMs?: Ms }
  | { type: 'BUFFER_START' }
  | { type: 'BUFFER_END' }
  /** The player stopped and we did not ask it to. */
  | { type: 'EXTERNAL_PAUSE'; at: Ms }
  /** The player resumed and we did not ask it to. */
  | { type: 'EXTERNAL_RESUME' }
  /** Headphones or bluetooth gone. */
  | { type: 'OUTPUT_LOST' }
  | { type: 'RESUME_WATCH_EXPIRED' }
  | { type: 'ENDED' }
  | { type: 'ERROR'; message: string }
  | { type: 'APP_BACKGROUND' }
  | { type: 'APP_FOREGROUND' };

export type SaveReason = 'tick' | 'stop' | 'seek' | 'finished' | 'background' | 'other';

export type Effect =
  | { kind: 'load'; url: string; startMs: Ms }
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'seek'; toMs: Ms }
  /** The adapter runs `player.play()` again — expo/expo#50072. */
  | { kind: 'reassertFocus' }
  /** M2: `player.setPlaybackRate(rate, 'high')`. Emitted on SET_RATE and after every LOADED. */
  | { kind: 'setRate'; rate: number }
  | { kind: 'setLockScreen'; meta: LockScreenMeta }
  | { kind: 'clearLockScreen' }
  | {
      kind: 'savePosition';
      episodeId: string;
      offsetMs: Ms;
      durationMs?: Ms;
      finished: boolean;
      /**
       * M3 (research R5/R9). `explicitSeek` marks a deliberate move by the listener;
       * `reason` tells the position sync whether to upload now ('stop', 'seek',
       * 'finished', 'background') or wait for the 30 s timer ('tick', 'other').
       */
      explicitSeek: boolean;
      reason: SaveReason;
    }
  | { kind: 'saveSession'; episodeId: string; intent: 'play' | 'pause' }
  | { kind: 'startResumeWatch'; ms: Ms }
  /** The adapter sets a timer and sends back `RETRY_DUE`. */
  | { kind: 'scheduleRetry'; ms: Ms }
  | { kind: 'notify'; message: string };

/** FR-016: a surprise kill may cost at most this much. */
export const SAVE_EVERY_MS = 5_000;
/** FR-019: stopping inside this much of the end counts as finished. */
export const FINISHED_WITHIN_MS = 30_000;
/** FR-011a: after this, an unrequested pause is a permanent takeover. */
export const RESUME_WATCH_MS = 30_000;
/** FR-013 / SC-006: reload at the last position before giving up. Six tries
 *  spanning ~90 s — a real tunnel outlives 3 tries in 14 s, which is what the
 *  phone showed on 2026-09-20 (gate row 5c: gave up before Wi-Fi returned). */
export const MAX_RETRIES = 6;
/** 2 s, 4 s, 8 s, 16 s, then capped. */
export const RETRY_BASE_MS = 2_000;
export const RETRY_CAP_MS = 30_000;

/**
 * FR-015: what the listener is told. Deliberately not the adapter's message —
 * "MediaCodec error 0x80001001" is not a sentence anyone can act on, and a
 * player that fails silently is the other half of the same requirement.
 */
export const PLAYBACK_FAILED_MESSAGE =
  'This episode could not be played. Check your connection and try again.';

/**
 * State the reducer needs that the listener never sees.
 *
 * RAISED, not papered over: `contracts/playback.ts` declares this as
 * `{ loadId, retries }`, and that shape cannot express the retry transition
 * the same contract requires. `RETRY_DUE` must emit `load(url, positionMs)`
 * and `LOADED` must emit `setLockScreen(meta)`, but only the `loading` state
 * carries `url` and no state carries `meta` — so after `ERROR` moves a
 * `playing` state back to `loading`, there is nowhere to read them from.
 * `url` and `meta` are therefore carried here, which is exactly what the
 * contract says this type is for ("not part of the visible state"). The
 * visible `PlayerState` union is unchanged from the contract.
 */
export type PlayerContext = {
  loadId: number;
  retries: number;
  url: string;
  meta: LockScreenMeta;
  /** M2 (FR-012/013): the playback rate the player must run at; re-applied on every LOADED. */
  rate: number;
};

export const INITIAL_STATE: PlayerState = { kind: 'idle' };

export const INITIAL_CONTEXT: PlayerContext = {
  loadId: 0,
  retries: 0,
  url: '',
  meta: { title: '', artist: '' },
  rate: 1,
};
