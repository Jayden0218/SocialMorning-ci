/**
 * M12 FR-104 — a voice status: at most 60 s, deleted by the server at 48 h (constitution
 * 2.2.0). The server refuses more than 600 000 bytes, so the recording is mono AAC at
 * 64 kbit/s: 60 s ≈ 480 000 bytes. expo-audio's HIGH_QUALITY preset (stereo, 128 kbit/s)
 * would be ≈ 960 000 bytes for the same minute (expo-audio 58.0.0's RecordingConstants).
 * The options themselves are `VOICE_OPTIONS` in src/playback/expo-audio-adapter.ts.
 */
export const VOICE_MAX_MS = 60_000;
export const VOICE_MAX_BYTES = 600_000;
/** Mono: one channel at this rate (the recorder's options are in the playback adapter). */
export const VOICE_BIT_RATE = 64_000;

/** Bytes a recording of `ms` will take at the voice bit rate (the container adds a little). */
export const expectedBytes = (ms: number): number => Math.ceil((VOICE_BIT_RATE / 8) * (ms / 1000));

/** "0:07 / 1:00" */
export function voiceClock(ms: number): string {
  const s = Math.min(Math.floor(ms / 1000), VOICE_MAX_MS / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} / 1:00`;
}

/** "Posted 3 h ago · gone in 45 h" — how long a post has left before the server deletes it. */
export function hoursLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 3_600_000));
}
