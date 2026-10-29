// The Updates card's swipe: up = Mark played, down = Remove, and only when the drag leans up or down.
/**
 * M31 D-A (design-pulse2 `index.html#updates--screen`). The break: let `leansVertical` accept any drag (drop the lean test) — the deck's
 * sideways scroll would mark episodes played; or drop the distance — a tap with a wobble would remove one. Each fails below.
 */
import { leansVertical, swipeIntent } from '@/ui/library/swipe';
import { UPDATES } from '@/ui/library/measures';

it('a long drag up marks played, a long drag down removes', () => {
  expect(swipeIntent(0, -(UPDATES.swipe.distance + 1))).toBe('up');
  expect(swipeIntent(5, UPDATES.swipe.distance + 1)).toBe('down');
});
it('a short drag does nothing', () => {
  expect(swipeIntent(0, -(UPDATES.swipe.distance - 1))).toBeUndefined();
  expect(swipeIntent(0, 30)).toBeUndefined();
});
it('a drag that leans sideways is the deck scrolling, not a swipe', () => {
  expect(leansVertical(100, -80)).toBe(false);
  expect(swipeIntent(100, -80)).toBeUndefined();
  expect(leansVertical(20, -80)).toBe(true);
  expect(leansVertical(0, -UPDATES.swipe.start)).toBe(false);
});
