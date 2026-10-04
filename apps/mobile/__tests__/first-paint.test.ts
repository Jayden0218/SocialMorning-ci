// Checks that the Discover page waits for its data, never past the cap, and never hides again.
/**
 * Owner, 2026-10-04: after signing in, the main screen appeared piece by piece. It now waits for
 * Discover and For You (src/discover/first-paint.ts).
 *
 * The break that turns it red: return `true` from `shouldShow` (the page would show at once again).
 */
import { FIRST_PAINT_CAP_MS, shouldShow } from '@/discover/first-paint';

it('waits while the data is still coming, and shows once it is in', () => {
  expect(shouldShow({ ready: false, waitedMs: 0, shownBefore: false })).toBe(false);
  expect(shouldShow({ ready: true, waitedMs: 0, shownBefore: false })).toBe(true);
});

it('a slow network does not keep the page hidden past the cap', () => {
  expect(shouldShow({ ready: false, waitedMs: FIRST_PAINT_CAP_MS - 1, shownBefore: false })).toBe(false);
  expect(shouldShow({ ready: false, waitedMs: FIRST_PAINT_CAP_MS, shownBefore: false })).toBe(true);
  expect(FIRST_PAINT_CAP_MS).toBeLessThanOrEqual(5000);
});

it('once shown, a later refresh never brings the loading mark back', () => {
  expect(shouldShow({ ready: false, waitedMs: 0, shownBefore: true })).toBe(true);
});
