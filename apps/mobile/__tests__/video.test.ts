/**
 * M10b US5 — the muted picture follows the sound: a drift beyond 1.5 s is corrected by a
 * seek, and play/pause follow the audio. The break that turns this red: return `{}` from
 * `followAudio` in `src/playback/video/sync.ts`.
 */
import { mediaKindOf } from '@socialmorning/social-core';
import { followAudio, MAX_DRIFT_MS } from '@/playback/video/sync';

it('in step and in the same state → nothing to do', () => {
  expect(followAudio({ positionMs: 10_000, playing: true }, { currentTimeS: 10.4, playing: true })).toEqual({});
});

it('drift beyond the limit → seek to the audio; a state change → follow it', () => {
  expect(followAudio({ positionMs: 60_000, playing: true }, { currentTimeS: 10, playing: false })).toEqual({ seekToS: 60, play: true });
  expect(followAudio({ positionMs: 5_000, playing: false }, { currentTimeS: 5 + (MAX_DRIFT_MS + 1) / 1000, playing: true })).toEqual({ seekToS: 5, play: false });
});

it('a video episode is recognised the same way on the phone as on the server', () => {
  expect(mediaKindOf('video/mp4', 'https://cdn/x')).toBe('video');
  expect(mediaKindOf(undefined, 'https://cdn/x.mp3')).toBe('audio');
});
