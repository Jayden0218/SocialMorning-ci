// The sums behind the speed dial and the sleep clock: angles, ticks, and a touch turned into a value.
/**
 * M31 T024 (design-pulse2 `listen.html` `speedDial`, `sleepClock`). The speed dial is 26 ticks from
 * 0.5× to 3.0× on a 270° arc that starts at the bottom left (135°, measured clockwise from east, as the
 * screen draws) and ends at the bottom right (405° = 45°). The sleep clock puts six minutes round a circle from
 * 12 o'clock. Pure, so a test can check them with no renderer.
 */
import { RATE_MAX, RATE_MIN, RATE_STEP } from '@socialmorning/player-core';

/** 0.5, 0.6 … 3.0 — 26 ticks. */
export const DIAL_TICKS = Math.round((RATE_MAX - RATE_MIN) / RATE_STEP) + 1;
export const DIAL_START = 135;
export const DIAL_SWEEP = 270;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** The angle (degrees, clockwise from east) of tick `k`. */
export function tickAngle(k: number): number {
  return DIAL_START + k * (DIAL_SWEEP / (DIAL_TICKS - 1));
}

/** The tick's rate. */
export function tickRate(k: number): number {
  return Math.round((RATE_MIN + k * RATE_STEP) * 10) / 10;
}

/** A "big" tick: a whole or half rate (0.5, 1, 1.5 … 3). */
export function isBigTick(k: number): boolean {
  return Math.abs(tickRate(k) * 2 - Math.round(tickRate(k) * 2)) < 0.001;
}

export type Tick = { x1: number; y1: number; x2: number; y2: number; lit: boolean; big: boolean; k: number };

/** The ticks for a dial of `size`, lit up to `rate`. */
export function ticks(size: number, rate: number): Tick[] {
  const c = size / 2;
  const r1 = size / 2 - 18;
  const r2 = size / 2 - 4;
  return Array.from({ length: DIAL_TICKS }, (_, k) => {
    const a = rad(tickAngle(k));
    const big = isBigTick(k);
    const ri = big ? r1 - 6 : r1;
    return { x1: c + Math.cos(a) * ri, y1: c + Math.sin(a) * ri, x2: c + Math.cos(a) * r2, y2: c + Math.sin(a) * r2, lit: tickRate(k) <= rate + 0.001, big, k };
  });
}

/** Where the knob sits for `rate`. */
export function knobPoint(size: number, rate: number): { x: number; y: number } {
  const c = size / 2;
  const r = size / 2 - 18 - 16;
  const a = rad(DIAL_START + ((rate - RATE_MIN) / RATE_STEP) * (DIAL_SWEEP / (DIAL_TICKS - 1)));
  return { x: c + Math.cos(a) * r, y: c + Math.sin(a) * r };
}

/**
 * A touch at (x, y) in a dial of `size` → 0–1 along the arc. The 90° gap at the bottom snaps to the
 * nearer end (left half → 0, right half → 1), so a finger that slips across the gap does not jump.
 */
export function dialFraction(x: number, y: number, size: number): number {
  const deg = ((Math.atan2(y - size / 2, x - size / 2) * 180) / Math.PI + 360) % 360;
  const t = deg >= DIAL_START ? deg - DIAL_START : deg + 360 - DIAL_START;
  if (t <= DIAL_SWEEP) return t / DIAL_SWEEP;
  return t > DIAL_SWEEP + (360 - DIAL_SWEEP) / 2 ? 0 : 1;
}

/** The sleep clock's minutes, from 12 o'clock clockwise. */
export const CLOCK_MINUTES = [5, 10, 15, 30, 45, 60] as const;

/** Where minute `i` of `n` sits on a clock of `size` whose circles are `dot` wide: the circle's centre. */
export function clockPoint(i: number, n: number, size: number, dot: number): { x: number; y: number } {
  const c = size / 2;
  const r = size / 2 - dot / 2 - 2;
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return { x: c + Math.cos(a) * r, y: c + Math.sin(a) * r };
}

/** A minutes timer's elapsed share (0–1): what the clock's track has filled by `remainingMs` of `minutes`. */
export function elapsedShare(minutes: number, remainingMs: number): number {
  const total = minutes * 60_000;
  return total <= 0 ? 0 : Math.min(1, Math.max(0, 1 - remainingMs / total));
}
