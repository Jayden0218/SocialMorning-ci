/**
 * The loading mark (owner, 2026-09-27). The break that turns the first test red: make
 * `barDelay` return 0, so every bar moves together and the wave is gone.
 */
import { LOADER_BARS, LOADER_CYCLE_MS, barDelay, barRest } from '@/ui/loader-timing';

it('the bars start one after another, all within the first half of the cycle', () => {
  const delays = Array.from({ length: LOADER_BARS }, (_, i) => barDelay(i));
  expect(new Set(delays).size).toBe(LOADER_BARS);
  for (let i = 1; i < LOADER_BARS; i++) expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
  expect(Math.max(...delays)).toBeLessThan(LOADER_CYCLE_MS / 2);
});

it('at rest the middle bar is tallest and the shape is symmetric, like the icon\'s waves', () => {
  const rest = Array.from({ length: LOADER_BARS }, (_, i) => barRest(i));
  const mid = Math.floor(LOADER_BARS / 2);
  expect(Math.max(...rest)).toBe(rest[mid]);
  for (let i = 0; i < LOADER_BARS; i++) expect(rest[i]).toBeCloseTo(rest[LOADER_BARS - 1 - i]!);
  for (const r of rest) { expect(r).toBeGreaterThan(0); expect(r).toBeLessThanOrEqual(1); }
});
