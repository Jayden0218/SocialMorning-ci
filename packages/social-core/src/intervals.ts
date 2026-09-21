/**
 * M4 research R3: listening time is the length of the UNION of listened intervals in
 * episode time. Intervals come from the player's TICKs: consecutive ticks on one
 * episode at most `maxGapMs` apart extend the open interval; anything else (a seek, a
 * pause, a reload, another episode) closes it. A union, not a sum, so a re-report or a
 * second phone never double-counts (SC-006). Guards G2 (a seek is a gap) and G3
 * (union not sum).
 */
export type Range = readonly [fromMs: number, toMs: number];
export type ListenAcc = { episodeId: string; open?: Range; closed: Range[] };

export const TICK_MAX_GAP_MS = 5_000;

export function addTick(acc: ListenAcc | undefined, episodeId: string, positionMs: number, maxGapMs: number = TICK_MAX_GAP_MS): ListenAcc {
  if (acc === undefined || acc.episodeId !== episodeId) {
    const closed = acc === undefined ? [] : closeAcc(acc);
    return { episodeId, open: [positionMs, positionMs], closed };
  }
  if (acc.open === undefined) return { ...acc, open: [positionMs, positionMs] };
  const delta = positionMs - acc.open[1];
  if (delta > 0) return { ...acc, open: [acc.open[0], positionMs] };
  // Backwards, stalled, or too far ahead: the old interval ends here, a new one starts.
  return { episodeId, open: [positionMs, positionMs], closed: closeAcc(acc) };
}

/** Everything listened so far, merged, with the open interval closed. Zero-length ones drop out. */
export function closeAcc(acc: ListenAcc): Range[] {
  return mergeRanges(acc.open === undefined ? acc.closed : [...acc.closed, acc.open]);
}

export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = ranges.filter((r) => r[1] > r[0]).map((r): Range => [r[0], r[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

export function unionLength(sets: readonly (readonly Range[])[]): number {
  return sets.flat().reduce((n, r) => n + (r[1] - r[0]), 0);
}
