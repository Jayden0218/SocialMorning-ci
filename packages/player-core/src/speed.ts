// Keeps playback speed between 0.5 and 3.0 and picks each show's speed.
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

/** M21 US2: whether this show plays at its own saved speed ("This show only" is on). */
export function hasShowRate(feedUrl: string, prefs: ReadonlyMap<string, number>): boolean {
  return prefs.has(feedUrl);
}

/**
 * M21 US2: "This show only" turned off — the show's saved speed is dropped, so `rateFor` gives the
 * app-wide default for it from now on. A copy; the input is not changed.
 */
export function clearShowRate(prefs: ReadonlyMap<string, number>, feedUrl: string): Map<string, number> {
  const next = new Map(prefs);
  next.delete(feedUrl);
  return next;
}

/** M21 US2: the speed slider — a point along the track (0..1) to a rate in 0.1 steps, and back. */
export function rateAtFraction(fraction: number): number {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return clampRate(RATE_MIN + f * (RATE_MAX - RATE_MIN));
}

export function fractionOfRate(rate: number): number {
  return (clampRate(rate) - RATE_MIN) / (RATE_MAX - RATE_MIN);
}
