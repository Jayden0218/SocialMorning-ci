/**
 * OUTPUT_LOST, and why nothing in the app can currently produce it.
 *
 * T039 asked: does expo-audio 58 expose an audio-route / output-change event
 * we can map to `OUTPUT_LOST` (FR-012, gate item 3)?
 *
 * ANSWER, VERIFIED against the INSTALLED package on 2026-09-20, not recalled:
 *
 *   grep -rniE 'becomingNoisy|routeChange|outputChange|headphone|bluetooth|
 *               deviceDisconnect|audioRoute|onAudioFocus' \
 *        node_modules/expo-audio/build/
 *   -> 0 matches
 *
 *   node_modules/expo-audio/build/AudioEventKeys.d.ts lists EVERY event key
 *   the module publishes:
 *     playbackStatusUpdate · audioSampleUpdate · recordingStatusUpdate ·
 *     playlistStatusUpdate · trackChanged · audioStreamBuffer ·
 *     audioStreamStatus
 *   and `AudioEvents` (AudioModule.types.d.ts:220) has exactly two members,
 *   neither of them about routing.
 *
 * So: NO. There is no output-change event to map. The app relies on the
 * library's own pause instead — "[Android] Pause audio players and playlists
 * when headphones or Bluetooth audio devices disconnect" (expo/expo#48151),
 * which is new in expo-audio 58.0.0 and absent from 57.0.5, and which is why
 * research R1 targets SDK 58 at all.
 *
 * THE CONSEQUENCE, which is a real gap and is recorded rather than papered
 * over: that pause arrives at JS as an unrequested `playing: false`, i.e. as
 * `EXTERNAL_PAUSE` — the SAME event a phone call produces. The reducer
 * therefore treats a bluetooth disconnect as a transient interruption for up
 * to RESUME_WATCH_MS (30 s) before settling on `paused`. For those 30 s an
 * `EXTERNAL_RESUME` would resume playback, which for a real disconnect would
 * mean audio out of the phone's speaker — exactly what FR-012 forbids.
 *
 * Whether that can actually happen depends on something only the phone can
 * answer: whether the library emits any `playing: true` after a disconnect.
 * It is gate row 3, it is NOT VERIFIED, and the fallback if it fails is
 * T042's native `OnAudioFocusChangeListener` module, which CAN distinguish
 * the two. `docs/M1-AUDIO-RISKS.md` carries the same note.
 *
 * DUCKING (research R4, FR-011, gate row 7) has the same shape. Android
 * delivers AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK for a navigation prompt or a
 * notification; a `doNotMix` player is expected to LOWER ITS VOLUME and keep
 * `playing: true`, which is invisible to JS. FR-011 requires a PAUSE. There
 * is no status field that would tell us it happened, so this cannot be
 * implemented from the JS side at all. Gate row 7 measures what the phone
 * does; if it ducks rather than pausing, T042 is the answer.
 */
import type { PlayerEvent } from './types';

/**
 * Whether expo-audio can tell us the audio output changed.
 *
 * `false`, and checked against the installed typings above rather than
 * assumed. If a future SDK adds the event, this becomes `true`, the
 * subscribe function below stops being a no-op, and gate row 3 is re-run.
 */
export const OUTPUT_CHANGE_EVENT_AVAILABLE = false;

/**
 * Where an output-change subscription WOULD live.
 *
 * It returns an unsubscribe and emits nothing, deliberately: a stub that
 * guessed at an event name would fail silently on the device, which is the
 * worst of the available outcomes. The listener parameter is kept so the
 * call site in the adapter does not change when the event arrives.
 */
export function subscribeToOutputChanges(
  _listener: (event: Extract<PlayerEvent, { type: 'OUTPUT_LOST' }>) => void,
): () => void {
  return () => undefined;
}
