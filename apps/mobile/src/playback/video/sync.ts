// Keeps a video picture in step with the playing audio.
/**
 * M10b US5 — keeping a muted picture in step with the sound. The audio engine stays the one
 * source of truth (position, comments, lock screen, the 100 %-branch adapter are untouched);
 * the video only follows it. A drift beyond `MAX_DRIFT_MS` is corrected by a seek.
 */
export const MAX_DRIFT_MS = 1_500;

export type VideoCommand = { seekToS?: number; play?: boolean };

/** What the video player should do so it matches the audio's position and play state. */
export function followAudio(audio: { positionMs: number; playing: boolean }, video: { currentTimeS: number; playing: boolean }): VideoCommand {
  const cmd: VideoCommand = {};
  if (Math.abs(video.currentTimeS * 1000 - audio.positionMs) > MAX_DRIFT_MS) cmd.seekToS = audio.positionMs / 1000;
  if (audio.playing !== video.playing) cmd.play = audio.playing;
  return cmd;
}
