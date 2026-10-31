// The sums behind the Pulse ring and heat bars: angles, spokes, colour steps, resampling.
/**
 * M31 T022: pure maths for `Ring.tsx` and `Curve.tsx`, kept apart so it can be tested with no
 * renderer. The ring is the reaction curve wrapped round a circle: 100 spokes (the 100 heat
 * buckets), starting at 12 o'clock and running clockwise, each as long as its bucket is hot.
 */
import { colour } from '@/design';

/** The number of heat buckets (constitution: 100, normalised 0–1 on read). */
export const BUCKETS = 100;

/** Seconds a screen-reader step moves the ring (design: swipe up/down = ±15 s). */
export const STEP_MS = 15_000;

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** 0–1 round the circle from 12 o'clock, clockwise → radians in screen space (0 = east). */
export function angleOf(fraction: number): number {
  return clamp01(fraction) * Math.PI * 2 - Math.PI / 2;
}

/** A touch at (x, y) in a box whose centre is (cx, cy) → 0–1 round the ring from 12 o'clock, clockwise. */
export function fractionAt(x: number, y: number, cx: number, cy: number): number {
  const a = Math.atan2(y - cy, x - cx) + Math.PI / 2;
  const f = a / (Math.PI * 2);
  return f - Math.floor(f);
}

export type Spoke = { x1: number; y1: number; x2: number; y2: number; index: number };

/**
 * The spokes for a ring of `size`: they start `size * inner / 2 + 10` from the centre (just
 * outside the cover) and are `4 + maxL * v` long, `maxL` leaving a 6 margin at the rim.
 */
export function spokes(size: number, inner: number, heat: readonly number[]): { spokes: Spoke[]; r0: number } {
  const c = size / 2;
  const r0 = (size * inner) / 2 + 10;
  const maxL = Math.max(0, size / 2 - r0 - 6);
  const out = Array.from({ length: BUCKETS }, (_, k) => {
    const v = clamp01(heat[k] ?? 0);
    const a = angleOf(k / BUCKETS);
    const len = 4 + maxL * v;
    return { x1: c + Math.cos(a) * r0, y1: c + Math.sin(a) * r0, x2: c + Math.cos(a) * (r0 + len), y2: c + Math.sin(a) * (r0 + len), index: k };
  });
  return { spokes: out, r0 };
}

/** Where on the ring (radius `r`) a fraction sits, for the knob and the pins. */
export function pointOn(size: number, r: number, fraction: number): { x: number; y: number } {
  const a = angleOf(fraction);
  return { x: size / 2 + Math.cos(a) * r, y: size / 2 + Math.sin(a) * r };
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` → `b` at `t` (0–1), as `rgb(r, g, b)`. */
export function mixColour(a: string, b: string, t: number): string {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  const u = clamp01(t);
  const m = (i: number) => Math.round(x[i]! + (y[i]! - x[i]!) * u);
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

/**
 * The played part's colour for step `k` of `n` (kit.js `grad`): hot at the start, violet at the
 * end of what has been played. `hot` is passed in so the listener's accent colour can replace it.
 */
export function playedColour(k: number, n: number, hot: string = colour.hot): string {
  return mixColour(hot, colour.violet, Math.min(1, k / Math.max(1, n)));
}

/** `n` samples of `data` (kit.js `pick`): every `round(len / n)`-th, at most `n`. Empty data → flat zeros. */
export function sample(data: readonly number[], n: number): number[] {
  if (data.length === 0) return Array.from({ length: n }, () => 0);
  const step = Math.max(1, Math.round(data.length / n));
  return data.filter((_, k) => k % step === 0).slice(0, n).map(clamp01);
}

/** How many of `n` bars are played at `fraction` (0–1). */
export function playedCount(fraction: number, n: number): number {
  return Math.round(clamp01(fraction) * n);
}

/** A badge's text: the count, `99+` over 99. */
export function badgeText(n: number): string {
  return n > 99 ? '99+' : String(n);
}
