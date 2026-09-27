export const HEAT_BUCKETS = 100;

/**
 * Which of the 100 fixed segments a moment falls in (constitution: 100 buckets
 * per episode). `least(99, floor(…))` — an offset at or past the end is the
 * LAST segment, never a 101st. Guard G1 is the test that fails without the min.
 */
export function bucketOf(offsetMs: number, durationMs: number): number {
  if (!(durationMs > 0)) throw new RangeError('bucketOf needs a positive durationMs');
  return Math.min(HEAT_BUCKETS - 1, Math.max(0, Math.floor((offsetMs * HEAT_BUCKETS) / durationMs)));
}

/**
 * 100 counts → 100 values in 0..1, divided by the highest count. An episode
 * nobody has marked is all zeros in and all zeros out — never NaN (guard G2).
 */
export function normaliseHeat(counts: readonly number[]): number[] {
  if (counts.length !== HEAT_BUCKETS) throw new RangeError(`normaliseHeat needs ${HEAT_BUCKETS} counts, got ${counts.length}`);
  const max = Math.max(0, ...counts);
  if (max === 0) return new Array<number>(HEAT_BUCKETS).fill(0);

  return counts.map((n) => Math.max(0, n) / max);
}
