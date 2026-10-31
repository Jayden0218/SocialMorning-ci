// Finds the hot moments of an episode from its heat curve: the peaks that stand out from the rest.
/**
 * M31 T024 (design-pulse2 `player--screen`: "🔥 next hot moment in 2:00"). The heat curve the phone
 * holds is 100 buckets normalised to 0–1 (tallest = 1) — it has no counts. A hot moment is a PEAK: a
 * bucket no lower than any within `PEAK_SPAN` buckets either side, at least `HOT_MIN` of the tallest and at
 * least `HOT_LIFT` times the curve's median (so a flat curve has none, and a lone reaction on silence has one).
 * Its extent is the run of buckets round it that are at least `HOT_EDGE` of its height.
 *
 * Round 2 (owner, 2026-10-28): the first rule — "one of the ten tallest AND half as tall as the tallest, and no
 * hot moment at all when twenty bars are within half of the tallest" — gave NOTHING for the drawing's own
 * curve (`PK.heat()`: five peaks at buckets 14, 30, 47, 63 and 82, twenty-six buckets within half of the
 * top), so the pill never showed. A busy curve with several clear peaks is the normal case, not a failure.
 * The server's Moments list (T026) uses counts and its own rule; this is only the player's hint.
 */
export type HotMoment = { fromMs: number; toMs: number };

/** A peak must be the highest bucket within this many buckets either side. */
export const PEAK_SPAN = 4;
/** A peak must be at least this share of the tallest bucket. */
export const HOT_MIN = 0.4;
/** … and at least this many times the curve's median (a flat curve has no standout). */
export const HOT_LIFT = 1.5;
/** A moment runs over the buckets round its peak that are at least this share of the peak. */
export const HOT_EDGE = 0.8;

/** The hot moments, in order, on the heat axis `axisMs` (the length the server first heard). */
export function hotMoments(buckets: readonly number[] | undefined, axisMs: number | undefined): HotMoment[] {
  if (!buckets || buckets.length === 0 || !axisMs || axisMs <= 0) return [];
  const top = Math.max(...buckets);
  if (!(top > 0)) return [];
  const median = [...buckets].sort((a, b) => a - b)[Math.floor(buckets.length / 2)]!;
  const per = axisMs / buckets.length;
  const out: HotMoment[] = [];
  buckets.forEach((v, i) => {
    if (v < top * HOT_MIN || v < median * HOT_LIFT) return;
    // The first of a plateau is the peak: nothing to its left within the span is as tall, nothing within the span is taller.
    for (let k = Math.max(0, i - PEAK_SPAN); k <= Math.min(buckets.length - 1, i + PEAK_SPAN); k++) {
      if (k < i ? buckets[k]! >= v : buckets[k]! > v) return;
    }
    let from = i;
    let to = i;
    while (from > 0 && buckets[from - 1]! >= v * HOT_EDGE) from--;
    while (to < buckets.length - 1 && buckets[to + 1]! >= v * HOT_EDGE) to++;
    const last = out[out.length - 1];
    if (last && last.toMs >= from * per) last.toMs = Math.max(last.toMs, (to + 1) * per);
    else out.push({ fromMs: from * per, toMs: (to + 1) * per });
  });
  return out;
}

/** The hot moment the position is inside, if any. */
export function hotNow(moments: readonly HotMoment[], positionMs: number): HotMoment | undefined {
  return moments.find((m) => positionMs >= m.fromMs && positionMs < m.toMs);
}

/** The next hot moment that starts after the position, if any. */
export function nextHot(moments: readonly HotMoment[], positionMs: number): HotMoment | undefined {
  return moments.find((m) => m.fromMs > positionMs);
}

/**
 * The pill's words: "next hot moment in 2:00" (whole seconds, `mmss`), "hot right now" inside one,
 * nothing when there is no more. `undefined` hides the pill.
 */
export function hotPillText(moments: readonly HotMoment[], positionMs: number, mmss: (ms: number) => string): string | undefined {
  if (hotNow(moments, positionMs)) return 'hot right now';
  const next = nextHot(moments, positionMs);
  return next ? `next hot moment in ${mmss(next.fromMs - positionMs)}` : undefined;
}

/**
 * The 100 heat buckets re-cut onto the player's own axis. The server buckets against the length it
 * was first told (the feed's); the player measures the audio. Bucket i covers `[i, i+1) × axis/100`;
 * on the player's axis that is a slice of `axis / duration` of the ring, and the rest is flat.
 */
export function alignHeat(buckets: readonly number[] | undefined, axisMs: number | undefined, durationMs: number | undefined, n = 100): number[] {
  const flat = Array.from({ length: n }, () => 0);
  if (!buckets || buckets.length === 0) return flat;
  if (!axisMs || !durationMs || Math.abs(axisMs - durationMs) < 1000) return Array.from({ length: n }, (_, i) => buckets[Math.floor((i * buckets.length) / n)] ?? 0);
  return Array.from({ length: n }, (_, i) => {
    const at = ((i + 0.5) / n) * durationMs;
    const b = Math.floor((at / axisMs) * buckets.length);
    return b >= 0 && b < buckets.length ? buckets[b]! : 0;
  });
}
