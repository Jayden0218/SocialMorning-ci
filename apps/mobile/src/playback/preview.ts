// A paid episode's free preview: play only [startMs, endMs) for a listener who has not bought it.
/**
 * M24 US13 (specs/025-m24-gaps-and-look). The creator sets a preview range in the Studio; the
 * server answers a link to the same file plus the range (`GET /v1/hosted/episodes/:id/preview`).
 * Nothing is cut or copied (constitution V: a range, no audio of our own).
 *
 * `startPreview` plays the range through the runtime's clip mode (seek to the start once loaded,
 * pause at the end) and adds a watch that clip mode does not have: a listener who presses Play
 * again, or drags past the end, is stopped and put back at the start; one who drags before the
 * start is moved to it. The watch ends with the next load of anything — the same episode
 * bought and played in full is a new load, so it plays whole.
 *
 * Stated plainly: this is the app keeping its word, not DRM. The link is the episode's file.
 */
import type { PlayableEpisode, PlayerRuntime } from './store';
import type { Ms, PlayerState } from './types';

export type PreviewRange = { startMs: Ms; endMs: Ms };
export type PreviewWatch = { episodeId: string; loadId: number | undefined; range: PreviewRange };
/** none: leave it · stop: pause and go back to the start · rewind: move to the start · release: the watch is over. */
export type PreviewStep = 'none' | 'stop' | 'rewind' | 'release';

/** A position this far before the start still counts as at the start (a seek lands a little early). */
export const START_SLACK_MS = 1_000;

/** What the watch does about the player's state now. Pure, so every branch is tested without a device. */
export function previewStep(w: PreviewWatch, s: PlayerState): PreviewStep {
  if (s.kind === 'idle') return 'release';
  if (s.kind === 'loading') return s.episodeId === w.episodeId && (w.loadId === undefined || s.loadId === w.loadId) ? 'none' : 'release';
  if (s.episodeId !== w.episodeId) return 'release';
  if (s.kind !== 'playing' && s.kind !== 'buffering') return 'none';
  if (s.positionMs >= w.range.endMs) return 'stop';
  if (s.positionMs < w.range.startMs - START_SLACK_MS) return 'rewind';
  return 'none';
}

let active: (() => void) | undefined;

/** Ends the watch now (nothing else changes). */
export function stopPreview(): void {
  const end = active;
  active = undefined;
  end?.();
}

/** Whether a preview watch is on. */
export const previewActive = (): boolean => active !== undefined;

/** Plays only the range of `episode`; returns the function that ends the watch. */
export function startPreview(runtime: PlayerRuntime, episode: PlayableEpisode, range: PreviewRange): () => void {
  stopPreview();
  runtime.playClip(episode, range);
  const first = runtime.getState();
  const w: PreviewWatch = { episodeId: episode.id, loadId: first.kind === 'loading' ? first.loadId : undefined, range };
  const unsubscribe = runtime.subscribe(() => {
    const step = previewStep(w, runtime.getState());
    if (step === 'release') stopPreview();
    else if (step === 'stop') { runtime.pause(); runtime.seek(range.startMs); }
    else if (step === 'rewind') runtime.seek(range.startMs);
  });
  const end = () => unsubscribe();
  active = end;
  return () => { if (active === end) stopPreview(); };
}
