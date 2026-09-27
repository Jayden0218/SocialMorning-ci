/**
 * The loading mark's timing (owner, 2026-09-27: "create your own special loading icon").
 * Five sound-wave bars — the waves beside the microphone in the app icon — rise and fall
 * one after another, like a voice being heard. Each bar runs the same loop, started later.
 */
export const LOADER_BARS = 5;
export const LOADER_CYCLE_MS = 900;

/** When bar `i` starts: an even stagger across the first half of the cycle. */
export function barDelay(i: number): number {
  return Math.round((i * LOADER_CYCLE_MS) / 2 / LOADER_BARS);
}

/** Resting height, as a share of full: the middle bar tallest, like the icon's waves. */
export function barRest(i: number): number {
  const mid = (LOADER_BARS - 1) / 2;
  return 0.35 + 0.25 * (1 - Math.abs(i - mid) / mid);
}
