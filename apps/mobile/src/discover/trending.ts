// Picks trending show names to rotate as hints in the search box.
/**
 * What the Discover search box says in its middle (owner, 2026-09-27): what is trending,
 * one title at a time. The names come from the Top chart — show names, because they are
 * short and are what a listener would search for — then the Talked-about chart.
 */
import type { ChartTab } from './sections';

export const HINT_EVERY_MS = 4_000;
const MAX_HINTS = 5;

export function trendingHints(chart: readonly ChartTab[]): string[] {
  const order = ['top', 'talked'] as const;
  const out: string[] = [];
  for (const key of order) {
    for (const row of chart.find((t) => t.key === key)?.rows ?? []) {
      const name = row.showTitle.trim();
      if (name && !out.includes(name)) out.push(name);
      if (out.length === MAX_HINTS) return out;
    }
  }
  return out;
}

/** The hint to show at tick `n` (one tick per `HINT_EVERY_MS`), or undefined when there is none. */
export function hintAt(hints: readonly string[], n: number): string | undefined {
  return hints.length === 0 ? undefined : hints[((n % hints.length) + hints.length) % hints.length];
}
