/**
 * The mini player's progress ring (owner's reference, 2026-09-27), drawn without SVG.
 * The break that turns the first test red: drop the `Math.min(p, 0.5)` in
 * `src/ui/ring.ts`, so the right half keeps turning past half-way.
 */
import { ringAngles } from '../src/ui/ring';

it('the right half fills 0 → 0.5 and then stops; the left half waits, then fills 0.5 → 1', () => {
  expect(ringAngles(0)).toEqual({ right: -135, left: -135 });
  expect(ringAngles(0.25)).toEqual({ right: -45, left: -135 });
  expect(ringAngles(0.5)).toEqual({ right: 45, left: -135 });
  expect(ringAngles(0.75)).toEqual({ right: 45, left: -45 });
  expect(ringAngles(1)).toEqual({ right: 45, left: 45 });
});

it('out-of-range or unknown progress never draws past the ends', () => {
  expect(ringAngles(-1)).toEqual(ringAngles(0));
  expect(ringAngles(3)).toEqual(ringAngles(1));
  expect(ringAngles(Number.NaN)).toEqual(ringAngles(0));
});
