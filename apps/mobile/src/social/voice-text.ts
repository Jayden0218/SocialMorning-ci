// Records a voice post or comment while the phone turns the speech into text, then shrinks the audio.
/**
 * M20 US3 (spec FR-006–FR-008; research R1). The phone's own speech service runs WHILE the
 * listener records (expo-speech-recognition, `recordingOptions.persist`): one pass gives the text
 * and a WAV file. The WAV (≈ 1.9 MB a minute) is then encoded on the phone to mono AAC at
 * 64 kbit/s by `modules/clip-video`'s `encodeAudio`, so the upload stays under the 600 000-byte
 * voice cap and the server still stores the file as it arrives (constitution V).
 *
 * Android 12 and older, a phone without a speech service, or a build without either native
 * module → `textRecorder()` is undefined and the caller keeps today's expo-audio recorder with
 * no text (FR-008). Loaded with `requireOptionalNativeModule`, so Jest and old builds are safe.
 */
import { requireOptionalNativeModule } from 'expo';
import { VOICE_MAX_MS } from './voice';

/** The part of ExpoSpeechRecognition this file uses (expo-speech-recognition 57.1.0). */
export type SpeechModule = {
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  supportsRecording(): boolean;
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  addListener(event: string, fn: (e: never) => void): { remove(): void };
};
export type Encoder = (wavUri: string) => Promise<{ uri: string; bytes: number }>;

/** What the listener checks before posting: the encoded audio and the text (null = none made). */
export type VoiceTake = { uri: string; bytes: number; durationMs: number; text: string | null };

/**
 * The text as the speech service gives it: final segments in order, then the latest unfinished
 * one. Android's continuous mode starts a new segment after each final result (README, §continuous).
 */
export function createTranscript(): { result(e: { results: { transcript: string }[]; isFinal: boolean }): void; text(): string | null } {
  const finals: string[] = [];
  let interim = '';
  return {
    result(e) {
      const t = (e.results[0]?.transcript ?? '').trim();
      if (e.isFinal) { if (t) finals.push(t); interim = ''; } else interim = t;
    },
    text() {
      const all = [...finals, interim].filter((s) => s.length > 0).join(' ').replace(/\s+/g, ' ').trim();
      return all.length > 0 ? all.slice(0, 2000) : null;
    },
  };
}

export type TextRecorder = {
  /** Asks for the microphone (and, on iPhone, speech) permission, then starts. False = not allowed. */
  start(): Promise<boolean>;
  elapsedMs(): number;
  /** Stops, waits for the service to finish, encodes the audio. Rejects if no audio was kept. */
  stop(): Promise<VoiceTake>;
  /** Throws the recording away. */
  cancel(): void;
};

/** The recorder, or undefined where the phone cannot make text (the caller falls back). */
export function textRecorder(deps: { speech?: SpeechModule | null; encode?: Encoder | null; now?: () => number; lang?: string } = {}): TextRecorder | undefined {
  const speech = deps.speech !== undefined ? deps.speech : requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition');
  const encode = deps.encode !== undefined ? deps.encode : defaultEncoder();
  if (!speech || !encode) return undefined;
  try { if (!speech.supportsRecording() || !speech.isRecognitionAvailable()) return undefined; } catch { return undefined; }
  const now = deps.now ?? Date.now;
  let startedAt = 0;
  let stoppedAt = 0;
  let subs: { remove(): void }[] = [];
  let transcript = createTranscript();
  let wav: string | undefined;
  // iPhone walk 2026-10-06 (B4 failed with no reason): keep the service's own error, so the message can say it.
  let lastError: string | undefined;
  let ended: (() => void) | undefined;
  let endedP: Promise<void> = Promise.resolve();
  const off = () => { for (const s of subs) s.remove(); subs = []; };

  return {
    async start() {
      const p = await speech.requestPermissionsAsync().catch(() => ({ granted: false }));
      if (!p.granted) return false;
      transcript = createTranscript();
      wav = undefined;
      lastError = undefined;
      endedP = new Promise<void>((resolve) => { ended = resolve; });
      subs = [
        speech.addListener('result', ((e: { results: { transcript: string }[]; isFinal: boolean }) => transcript.result(e)) as never),
        speech.addListener('audioend', ((e: { uri?: string | null }) => { if (e.uri) wav = e.uri; }) as never),
        // A no-speech or network error still ends the session; the audio may be kept without text.
        speech.addListener('end', (() => ended?.()) as never),
        speech.addListener('error', ((e: { error?: string; message?: string }) => { lastError = `${e.error ?? 'error'}${e.message ? `: ${e.message}` : ''}`; console.warn('voice-text error', lastError); }) as never),
      ];
      speech.start({
        lang: deps.lang ?? deviceLang(),
        interimResults: true,
        continuous: true,
        recordingOptions: { persist: true, outputSampleRate: 16000, outputEncoding: 'pcmFormatInt16' },
      });
      startedAt = now();
      stoppedAt = 0;
      return true;
    },
    elapsedMs() { return Math.min((stoppedAt || now()) - startedAt, VOICE_MAX_MS); },
    async stop() {
      stoppedAt = now();
      speech.stop();
      // The service flushes its last result, then sends audioend and end; never wait forever.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([endedP, new Promise<void>((r) => { timer = setTimeout(r, 5_000); })]);
      if (timer !== undefined) clearTimeout(timer);
      off();
      if (!wav) throw new Error(lastError ? `The phone's speech service stopped (${lastError}).` : 'The recording was not kept — try again.');
      const out = await encode(wav);
      return { uri: out.uri, bytes: out.bytes, durationMs: Math.min(stoppedAt - startedAt, VOICE_MAX_MS), text: transcript.text() };
    },
    cancel() { off(); try { speech.abort(); } catch { /* already stopped */ } },
  };
}

function defaultEncoder(): Encoder | null {
  const m = requireOptionalNativeModule<{ encodeAudio(uri: string): Promise<{ uri: string; bytes: number }> }>('ClipVideo');
  return m && typeof m.encodeAudio === 'function' ? (uri) => m.encodeAudio(uri) : null;
}

/** The phone's language, e.g. "en-MY" or "zh-CN"; the speech service picks its nearest model. */
function deviceLang(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'; } catch { return 'en-US'; }
}
