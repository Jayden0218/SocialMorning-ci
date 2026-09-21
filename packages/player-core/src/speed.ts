export const RATE_MIN = 0.5;
export const RATE_MAX = 3.0;
export const RATE_STEP = 0.1;

/** 0.5..3.0 in 0.1 steps (FR-012). Guard G4: without the clamp, 3.7 goes to the player. */
export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  const stepped = Math.round(rate / RATE_STEP) * RATE_STEP;
  const clamped = Math.min(RATE_MAX, Math.max(RATE_MIN, stepped));
  return Math.round(clamped * 10) / 10;
}

/** FR-013: the show's remembered rate, else the app-wide default. */
export function rateFor(feedUrl: string, prefs: ReadonlyMap<string, number>, defaultRate: number): number {
  const pref = prefs.get(feedUrl);
  return clampRate(pref ?? defaultRate);
}
