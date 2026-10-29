// Which way a finger moved on an Updates card: up marks it played, down removes it.
/**
 * M31 D-A (design-pulse2 `index.html#updates--screen` note: "Swipes on a card: up = Mark played, down = Remove (today's row swipes,
 * turned for a sideways deck)"). The deck scrolls sideways, so only a drag that leans up or down counts, and it must travel
 * `UPDATES.swipe.distance`. Pure, so a test reads the thresholds.
 */
import { UPDATES } from './measures';

export type SwipeIntent = 'up' | 'down';

/** Does a drag of (dx, dy) lean up or down enough to be a card swipe rather than the deck's sideways scroll? */
export function leansVertical(dx: number, dy: number): boolean {
  return Math.abs(dy) > UPDATES.swipe.start && Math.abs(dy) > UPDATES.swipe.lean * Math.abs(dx);
}

/** What a finished drag means: up (negative dy) = 'up', down = 'down'; too short or too sideways = nothing. */
export function swipeIntent(dx: number, dy: number): SwipeIntent | undefined {
  if (!leansVertical(dx, dy) || Math.abs(dy) < UPDATES.swipe.distance) return undefined;
  return dy < 0 ? 'up' : 'down';
}
