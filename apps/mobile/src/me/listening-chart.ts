// The Listening data chart's maths and words: the axis top, the bar boxes, and day, month and minute labels.
/**
 * M21 US9: the bar chart on the Listening data page is our own SVG (no chart library). One series,
 * one colour; the axis is labelled (0 and a round top), the first and last bars are named under
 * the chart, and a tapped bar says its value. Pure functions so the tests can check them.
 */

/** A round number at or above `max` minutes for the top of the axis (never 0). */
export function niceMax(max: number): number {
  const steps = [5, 10, 15, 30, 60, 90, 120, 180, 240, 360, 480, 720, 960, 1440];
  const hit = steps.find((s) => s >= max);
  if (hit !== undefined) return hit;
  // Over a day (a month in the all-time view): whole tens of hours.
  return Math.ceil(max / 600) * 600;
}

/** "45 min", "2 h", "2 h 5 min". */
export function minutesLabel(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "5 Oct" for a day (`YYYY-MM-DD`), "Oct 2026" for a month (`YYYY-MM`); anything else unchanged. */
export function pointLabel(day: string): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (d) return `${Number(d[3])} ${MONTHS[Number(d[2]) - 1] ?? d[2]}`;
  const m = /^(\d{4})-(\d{2})$/.exec(day);
  if (m) return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  return day;
}

export type BarBox = { x: number; y: number; width: number; height: number };

/**
 * Bars across `width` × `height` with a `gap` between them (2 pt keeps them apart); each bar's
 * height is its share of `top`. A bar with any minutes is at least 2 pt tall so it can be seen.
 */
export function barBoxes(values: readonly number[], width: number, height: number, top: number, gap: number = 2): BarBox[] {
  if (values.length === 0 || width <= 0 || height <= 0) return [];
  const w = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  return values.map((v, i) => {
    const h = v > 0 ? Math.max(2, (Math.min(v, top) / top) * height) : 0;
    return { x: i * (w + gap), y: height - h, width: w, height: h };
  });
}

/** The spoken summary of the chart: the total and the busiest point. */
export function chartSpoken(points: readonly { day: string; minutes: number }[], unit: 'day' | 'month'): string {
  const best = points.reduce<{ day: string; minutes: number } | undefined>((b, p) => (p.minutes > (b?.minutes ?? 0) ? p : b), undefined);
  const total = points.reduce((s, p) => s + p.minutes, 0);
  return best
    ? `Bar chart of minutes listened per ${unit}. ${minutesLabel(total)} in all; most on ${pointLabel(best.day)}: ${minutesLabel(best.minutes)}.`
    : `Bar chart of minutes listened per ${unit}. Nothing listened.`;
}
