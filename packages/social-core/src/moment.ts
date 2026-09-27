import type { Moment, PlaybackSnapshot } from './types';

/**
 * FR-007: the moment a comment attaches to is the position when the composer
 * OPENED. `captureMoment` is called exactly once, at open, and the composer keeps
 * the value it returns. It must never be called again on submit — guard G5 is
 * the test that fails if someone "helpfully" re-reads the player position later.
 */
export function captureMoment(s: PlaybackSnapshot): Moment {
  return { offsetMs: Math.max(0, Math.floor(s.offsetMs)) };
}
