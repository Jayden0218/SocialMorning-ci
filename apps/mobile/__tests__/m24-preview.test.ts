// Tests that a paid episode's free preview plays only its range, and lets go on the next load.
/**
 * M24 US13 (src/playback/preview.ts). `src/playback` is held to 100 % branches, so every branch
 * of `previewStep` and the watch is exercised here with a fake runtime — no device, no audio.
 */
import { previewActive, previewStep, startPreview, stopPreview, START_SLACK_MS, type PreviewWatch } from '@/playback/preview';
import type { PlayableEpisode, PlayerRuntime } from '@/playback/store';
import type { PlayerState } from '@/playback/types';

const range = { startMs: 60_000, endMs: 120_000 };
const w: PreviewWatch = { episodeId: 'E', loadId: 7, range };
const playing = (positionMs: number, episodeId = 'E'): PlayerState => ({ kind: 'playing', episodeId, positionMs, lastSavedMs: 0 });

describe('previewStep', () => {
  it('lets go when the player is idle, loads something else, or loads again', () => {
    expect(previewStep(w, { kind: 'idle' })).toBe('release');
    expect(previewStep(w, { kind: 'loading', episodeId: 'X', loadId: 7, intent: 'play', positionMs: 0, url: 'u' })).toBe('release');
    expect(previewStep(w, { kind: 'loading', episodeId: 'E', loadId: 8, intent: 'play', positionMs: 0, url: 'u' })).toBe('release');
    expect(previewStep(w, playing(0, 'X'))).toBe('release');
    expect(previewStep(w, { kind: 'error', message: 'no' })).toBe('release');
  });

  it('keeps its own load, also when it never saw the load id', () => {
    expect(previewStep(w, { kind: 'loading', episodeId: 'E', loadId: 7, intent: 'play', positionMs: 0, url: 'u' })).toBe('none');
    expect(previewStep({ ...w, loadId: undefined }, { kind: 'loading', episodeId: 'E', loadId: 99, intent: 'play', positionMs: 0, url: 'u' })).toBe('none');
  });

  it('does nothing while paused or ended', () => {
    expect(previewStep(w, { kind: 'paused', episodeId: 'E', positionMs: 500_000, by: 'user' })).toBe('none');
    expect(previewStep(w, { kind: 'ended', episodeId: 'E' })).toBe('none');
  });

  it('stops at the end, moves a too-early position to the start, leaves the range alone', () => {
    expect(previewStep(w, playing(120_000))).toBe('stop');
    expect(previewStep(w, { kind: 'buffering', episodeId: 'E', positionMs: 900_000, lastSavedMs: 0 })).toBe('stop');
    expect(previewStep(w, playing(range.startMs - START_SLACK_MS - 1))).toBe('rewind');
    expect(previewStep(w, playing(range.startMs - START_SLACK_MS))).toBe('none');
    expect(previewStep(w, playing(90_000))).toBe('none');
  });
});

/** A runtime with just what the preview uses; `set` changes the state and tells the listeners. */
function fakeRuntime(afterClip: PlayerState) {
  let state: PlayerState = { kind: 'idle' };
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const set = (s: PlayerState) => { state = s; for (const l of [...listeners]) l(); };
  const runtime = {
    getState: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    playClip: (e: PlayableEpisode, r: { startMs: number; endMs: number }) => { calls.push(`clip ${e.id} ${r.startMs}-${r.endMs}`); state = afterClip; },
    pause: () => { calls.push('pause'); },
    seek: (ms: number) => { calls.push(`seek ${ms}`); },
  } as unknown as PlayerRuntime;
  return { runtime, calls, set, listeners };
}

const episode: PlayableEpisode = { id: 'E', url: 'https://x/e.mp3', title: 'Paid one', showTitle: 'Show' };
const loading = (loadId: number, episodeId = 'E'): PlayerState => ({ kind: 'loading', episodeId, loadId, intent: 'play', positionMs: range.startMs, url: 'u' });

describe('startPreview', () => {
  afterEach(() => stopPreview());

  it('plays the range and stops a listener who plays past the end, back at the start', () => {
    const f = fakeRuntime(loading(3));
    startPreview(f.runtime, episode, range);
    expect(f.calls).toEqual(['clip E 60000-120000']);
    expect(previewActive()).toBe(true);
    f.set(playing(90_000));
    expect(f.calls).toEqual(['clip E 60000-120000']);
    f.set(playing(130_000));
    expect(f.calls).toEqual(['clip E 60000-120000', 'pause', 'seek 60000']);
    f.set(playing(10_000));
    expect(f.calls.at(-1)).toBe('seek 60000');
  });

  it('lets go on the next load — the same episode bought and played whole is not cut', () => {
    const f = fakeRuntime(loading(3));
    startPreview(f.runtime, episode, range);
    f.set(loading(4));
    expect(previewActive()).toBe(false);
    expect(f.listeners.size).toBe(0);
    f.set(playing(500_000));
    expect(f.calls).toEqual(['clip E 60000-120000']);
  });

  it('a second preview replaces the first; the first one\'s stop then does nothing', () => {
    const f = fakeRuntime({ kind: 'idle' });
    const stopFirst = startPreview(f.runtime, episode, range);
    startPreview(f.runtime, { ...episode, id: 'F' }, range);
    expect(f.listeners.size).toBe(1);
    stopFirst();
    expect(previewActive()).toBe(true);
  });

  it('its own stop ends the watch; stopping twice is harmless', () => {
    const f = fakeRuntime(loading(1));
    const stop = startPreview(f.runtime, episode, range);
    stop();
    expect(previewActive()).toBe(false);
    expect(f.listeners.size).toBe(0);
    stopPreview();
    expect(previewActive()).toBe(false);
  });
});
