/**
 * The ONLY module in this app that imports `expo-audio`.
 *
 * A grep for `from 'expo-audio'` anywhere else is a review failure. The point
 * is not tidiness: everything above this file is exercisable in Node, and the
 * moment a screen or the reducer imports the native module that stops being
 * true and SC-010 becomes untestable.
 *
 * API VERIFIED against the INSTALLED typings, not recalled (Principle III),
 * expo-audio 58.0.0:
 *   ExpoAudio.d.ts        createAudioPlayer(source?, options?)     : 226
 *                         setAudioModeAsync(mode: Partial<AudioMode>): 278
 *   AudioModule.types.d.ts AudioPlayer extends SharedObject<AudioEvents>
 *                         play() 135 · pause() 139 · replace() 143
 *                         seekTo(seconds): Promise<void> 150
 *                         setActiveForLockScreen(active, metadata?, options?) 174
 *                         updateLockScreenMetadata(metadata) 180
 *                         clearLockScreenControls() 185 · remove() 189
 *                         AudioEvents.playbackStatusUpdate(status) 222
 *   Audio.types.d.ts      AudioStatus: currentTime, duration, playing,
 *                         isBuffering, isLoaded, didJustFinish,
 *                         error: string | null, reasonForWaitingToPlay
 *                         AudioMetadata { title?, artist?, albumTitle?, artworkUrl? }
 *   AudioConstants.d.ts   AudioLockScreenOptions { showSeekForward?,
 *                         showSeekBackward?, showNextTrack?, ... }
 *
 * WHAT THE TYPINGS DO NOT CONTAIN, checked by grepping the whole build/
 * directory for becomingNoisy|routeChange|outputChange|headphone|bluetooth|
 * deviceDisconnect: NOTHING. expo-audio 58 exposes no audio-route or output-
 * change event to JS, and no interruption event either. So:
 *   - `OUTPUT_LOST` cannot be produced from this library. A bluetooth
 *     disconnect surfaces as the library's OWN pause (expo/expo#48151, new in
 *     58), which reaches us as an unrequested `playing: false` — i.e. as
 *     EXTERNAL_PAUSE, indistinguishable from a phone call until the resume
 *     watch expires. Recorded in docs/M1-AUDIO-RISKS.md.
 *   - the only signal that a call arrived is an unrequested `playing: false`,
 *     which is why `requestedPlay`/`requestedPause` below are load-bearing.
 *
 * NOT VERIFIED: none of this has run on a phone, or on any device at all.
 * Everything below about what Android actually does is inference from the
 * typings and the changelog, and stays NOT VERIFIED until quickstart Tier B.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';
import type { Effect, Ms, PlayerEvent } from './types';

/**
 * What the adapter can observe.
 *
 * It is `PlayerEvent` with one difference: the adapter cannot know the
 * reducer's `loadId` — that counter belongs to the state machine — so it
 * reports a load completing WITHOUT one and `store.ts` stamps the current
 * id on before dispatching. Inventing an id here is what would break A12.
 */
export type AdapterEvent =
  | Exclude<PlayerEvent, { type: 'LOADED' }>
  | { type: 'LOADED'; durationMs?: Ms };

export interface AudioAdapter {
  execute(effect: Effect): Promise<void>;
  subscribe(listener: (event: AdapterEvent) => void): () => void;
  configure(): Promise<void>;
  release(): void;
}

const secondsToMs = (seconds: number): Ms => Math.round(seconds * 1000);

/** expo-audio reports 0 for a duration it does not know yet; we report none. */
const durationOf = (status: AudioStatus): Ms | undefined =>
  status.duration > 0 ? secondsToMs(status.duration) : undefined;

export function createExpoAudioAdapter(
  makePlayer: () => AudioPlayer = () => createAudioPlayer(),
): AudioAdapter {
  // One player for the app's life. Creating one per episode is how you end
  // up with two of them holding audio focus.
  const player = makePlayer();

  // The only way to tell "the system took the audio" from "we pressed pause".
  let requestedPlay = false;
  let requestedPause = false;

  let wasPlaying = false;
  let wasBuffering = false;
  let wasLoaded = false;
  let lockScreenActive = false;

  /**
   * Effects run STRICTLY IN ORDER, one at a time.
   *
   * Without this they do not. `load` is the only effect that awaits
   * (`seekTo` returns a promise), so a `load` followed immediately by `play`
   * — which is exactly what RETRY_DUE emits — would call `player.play()`
   * while the seek was still in flight, and the episode would resume from
   * the wrong place after every recovered stall. Chaining also makes the
   * setLockScreen-before-play ordering a property of the adapter rather than
   * a coincidence of which calls happen to be synchronous, which matters
   * because gate item 1 depends on it (docs/M1-AUDIO-RISKS.md gap 1).
   */
  let chain: Promise<void> = Promise.resolve();

  function execute(effect: Effect): Promise<void> {
    // One failing effect must not stall every effect after it.
    chain = chain.then(() => run(effect)).catch(() => undefined);
    return chain;
  }

  async function run(effect: Effect): Promise<void> {
    switch (effect.kind) {
      case 'load':
        wasLoaded = false;
        player.replace({ uri: effect.url });
        await player.seekTo(effect.startMs / 1000);
        return;
      case 'play':
        requestedPlay = true;
        player.play();
        return;
      case 'pause':
        requestedPause = true;
        player.pause();
        return;
      case 'seek':
        await player.seekTo(effect.toMs / 1000);
        return;
      case 'reassertFocus':
        // expo/expo#50072: play() is the only documented path that
        // re-requests Android audio focus. Harmless if already playing.
        requestedPlay = true;
        player.play();
        return;
      case 'setRate':
        // M2 (research R2): AudioModule.types.d.ts:157 — pitch preserved at 'high'.
        player.setPlaybackRate(effect.rate, 'high');
        return;
      case 'setLockScreen': {
        // On Android this is what keeps background playback alive past about
        // three minutes; the now-playing metadata is the side effect, not the
        // purpose (docs/M1-AUDIO-RISKS.md gap 1).
        const metadata = {
          title: effect.meta.title,
          artist: effect.meta.artist,
          ...(effect.meta.artworkUrl !== undefined && { artworkUrl: effect.meta.artworkUrl }),
        };
        if (lockScreenActive) {
          // Already ours. Re-activating would tear the controls down and put
          // them back; the listener sees a flicker and Android sees a session
          // ending, which is the thing we are trying not to do.
          player.updateLockScreenMetadata(metadata);
          return;
        }
        lockScreenActive = true;
        player.setActiveForLockScreen(true, metadata, {
          showSeekForward: true,
          showSeekBackward: true,
        });
        return;
      }
      case 'clearLockScreen':
        lockScreenActive = false;
        player.setActiveForLockScreen(false);
        return;
      default:
        // savePosition, saveSession, startResumeWatch, scheduleRetry, notify:
        // the store owns storage and timers. The adapter owns the player.
        return;
    }
  }

  function subscribe(listener: (event: AdapterEvent) => void): () => void {
    const onStatus = (status: AudioStatus): void => {
      if (status.error !== null) {
        listener({ type: 'ERROR', message: status.error });
        return;
      }

      if (status.isLoaded && !wasLoaded) {
        wasLoaded = true;
        listener({ type: 'LOADED', durationMs: durationOf(status) });
      }

      if (status.didJustFinish) {
        // The finish status says `playing: false` (AudioPlayer.kt, onPlaybackStateUpdated).
        // Record it, or the replay's seek-to-0 status (`playing: false, currentTime: 0`)
        // reads as an unrequested pause at 0 — H4 on build 13 ended a replay at "0:00".
        wasPlaying = false;
        listener({ type: 'ENDED' });
        return;
      }

      if (status.isBuffering !== wasBuffering) {
        wasBuffering = status.isBuffering;
        listener({ type: status.isBuffering ? 'BUFFER_START' : 'BUFFER_END' });
      }

      if (status.playing !== wasPlaying) {
        wasPlaying = status.playing;
        if (status.playing) {
          // Resumed without us asking: the transient interruption ended and
          // the library took the audio back.
          if (!requestedPlay) listener({ type: 'EXTERNAL_RESUME' });
        } else if (!requestedPause) {
          // Stopped without us asking. A call, an alarm, another app, or a
          // bluetooth disconnect — expo-audio gives us no way to tell which.
          listener({ type: 'EXTERNAL_PAUSE', at: secondsToMs(status.currentTime) });
        }
        requestedPlay = false;
        requestedPause = false;
      }

      if (status.playing) {
        listener({
          type: 'TICK',
          positionMs: secondsToMs(status.currentTime),
          durationMs: durationOf(status),
        });
      }
    };

    const onAppState = (next: AppStateStatus): void => {
      listener({ type: next === 'active' ? 'APP_FOREGROUND' : 'APP_BACKGROUND' });
    };

    const statusSubscription = player.addListener('playbackStatusUpdate', onStatus);
    const appStateSubscription = AppState.addEventListener('change', onAppState);

    return () => {
      statusSubscription.remove();
      appStateSubscription.remove();
    };
  }

  async function configure(): Promise<void> {
    // interruptionMode MUST be doNotMix: the docs are explicit that lock
    // screen controls do not attach otherwise, and mixWithOthers requests no
    // Android audio focus at all, so nothing would ever yield to a call.
    await setAudioModeAsync({
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
    });
  }

  function release(): void {
    player.remove();
  }

  return { execute, subscribe, configure, release };
}
