// Tests when a drag on the player's top area counts as "close the player".
/**
 * M21 US2 (FR-010), iPhone walk 2026-10-07: the player closes by a drag down on its top area.
 * The break that turns it red: in src/ui/player/swipe-close.ts make `isSwipeDown` ignore the
 * sideways check, or `closesAt` close at any distance.
 */
import { closesAt, isSwipeDown } from '@/ui/player/swipe-close';

it('a drag counts once it is 20 pt down and more down than sideways; taps and sideways drags do not', () => {
  expect(isSwipeDown(0, 21)).toBe(true);
  expect(isSwipeDown(0, 20)).toBe(false);
  expect(isSwipeDown(30, 25)).toBe(false);
  expect(isSwipeDown(0, -40)).toBe(false);
});

it('only a drag past 60 pt closes; a short one springs back', () => {
  expect(closesAt(61)).toBe(true);
  expect(closesAt(60)).toBe(false);
  expect(closesAt(10)).toBe(false);
});
