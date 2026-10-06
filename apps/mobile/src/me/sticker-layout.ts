// The sticker canvas maths: sizes from the canvas width, drag, pinch and turn, add, stack and the button nudges.
/**
 * M21 US9 — the sticker canvas is OUR OWN DESIGN (owner, 2026-10-06), not a copy of 小宇宙's.
 *
 * Everything is a fraction of the canvas, and the canvas is always `ASPECT` × its width, so a
 * layout saved on one phone looks the same on another. A sticker's size is `SIZE` × the width ×
 * its scale. Pure functions, no React: the screens and their tests both use them.
 */
import { PLACEMENT_MAX, SCALE_MAX, SCALE_MIN, Z_MAX, type Placement } from '@socialmorning/social-core';

export type { Placement };
/** The canvas (and the layer over a profile header) is this many widths tall. */
export const ASPECT = 0.6;
/** A sticker at scale 1 is this much of the canvas width across. */
export const SIZE = 0.16;
export const MAX = PLACEMENT_MAX;
/** What one tap of a move / size / turn button does. */
export const STEP_MOVE = 0.03;
export const STEP_SCALE = 1.1;
export const STEP_TURN = Math.PI / 12;

export type Point = { x: number; y: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Into (−π, π]: one turn either way is the same sticker, and the server takes ±2π. */
export function normaliseTurn(rot: number): number {
  if (!Number.isFinite(rot)) return 0;
  let r = rot % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Keeps a placement inside what the server accepts. */
export function settle(p: Placement): Placement {
  return { stickerId: p.stickerId, x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), scale: clamp(p.scale, SCALE_MIN, SCALE_MAX), rot: normaliseTurn(p.rot), z: clamp(Math.round(p.z), 0, Z_MAX) };
}

/** A sticker's box in points on a canvas `width` wide: its centre and its side. */
export function box(p: Placement, width: number): { cx: number; cy: number; side: number } {
  return { cx: p.x * width, cy: p.y * width * ASPECT, side: SIZE * width * p.scale };
}

/** The topmost sticker under a point (in points from the canvas's top left), if any. */
export function hitTest(list: readonly Placement[], at: Point, width: number): string | undefined {
  const top = [...list].sort((a, b) => b.z - a.z);
  return top.find((p) => {
    const b = box(p, width);
    return Math.hypot(at.x - b.cx, at.y - b.cy) <= b.side / 2;
  })?.stickerId;
}

/**
 * One gesture step, from the placement when the fingers went down (`start`) and where the
 * fingers were then (`from`) and are now (`to`), in points. One finger drags; two fingers drag
 * by their middle, pinch to resize and turn together.
 */
export function gesture(start: Placement, from: readonly Point[], to: readonly Point[], width: number): Placement {
  if (from.length === 0 || to.length === 0 || width <= 0) return start;
  const mid = (ps: readonly Point[]) => (ps.length >= 2 ? { x: (ps[0]!.x + ps[1]!.x) / 2, y: (ps[0]!.y + ps[1]!.y) / 2 } : ps[0]!);
  const a = mid(from);
  const b = mid(to);
  const height = width * ASPECT;
  let next: Placement = { ...start, x: start.x + (b.x - a.x) / width, y: start.y + (b.y - a.y) / height };
  if (from.length >= 2 && to.length >= 2) {
    const d0 = Math.hypot(from[1]!.x - from[0]!.x, from[1]!.y - from[0]!.y);
    const d1 = Math.hypot(to[1]!.x - to[0]!.x, to[1]!.y - to[0]!.y);
    const a0 = Math.atan2(from[1]!.y - from[0]!.y, from[1]!.x - from[0]!.x);
    const a1 = Math.atan2(to[1]!.y - to[0]!.y, to[1]!.x - to[0]!.x);
    next = { ...next, scale: d0 > 0 ? start.scale * (d1 / d0) : start.scale, rot: start.rot + (a1 - a0) };
  }
  return settle(next);
}

/** Back to front, renumbered 0, 1, 2… so `z` never runs past 9 with 10 stickers. */
export function restack(list: readonly Placement[]): Placement[] {
  return [...list].sort((a, b) => a.z - b.z || a.stickerId.localeCompare(b.stickerId)).map((p, i) => ({ ...p, z: i }));
}

/** Places a sticker in the middle, on top. Unchanged when it is already there or 10 are placed. */
export function addSticker(list: readonly Placement[], stickerId: string): Placement[] {
  if (list.length >= MAX || list.some((p) => p.stickerId === stickerId)) return [...list];
  return restack([...list, { stickerId, x: 0.5, y: 0.5, scale: 1, rot: 0, z: Z_MAX + 1 }]);
}

export function removeSticker(list: readonly Placement[], stickerId: string): Placement[] {
  return restack(list.filter((p) => p.stickerId !== stickerId));
}

export function bringToFront(list: readonly Placement[], stickerId: string): Placement[] {
  return restack(list.map((p) => (p.stickerId === stickerId ? { ...p, z: Z_MAX + 1 } : p)));
}

/** Replaces one sticker's placement (settled), leaving the rest. */
export function update(list: readonly Placement[], next: Placement): Placement[] {
  return list.map((p) => (p.stickerId === next.stickerId ? settle(next) : p));
}

/** The accessible alternative to the gestures: one button press. */
export type Nudge = 'left' | 'right' | 'up' | 'down' | 'bigger' | 'smaller' | 'turnLeft' | 'turnRight';
export function nudge(p: Placement, how: Nudge): Placement {
  switch (how) {
    case 'left': return settle({ ...p, x: p.x - STEP_MOVE });
    case 'right': return settle({ ...p, x: p.x + STEP_MOVE });
    case 'up': return settle({ ...p, y: p.y - STEP_MOVE });
    case 'down': return settle({ ...p, y: p.y + STEP_MOVE });
    case 'bigger': return settle({ ...p, scale: p.scale * STEP_SCALE });
    case 'smaller': return settle({ ...p, scale: p.scale / STEP_SCALE });
    case 'turnLeft': return settle({ ...p, rot: p.rot - STEP_TURN });
    case 'turnRight': return settle({ ...p, rot: p.rot + STEP_TURN });
  }
}

/** Whether two layouts are the same (to know if there is anything to save). */
export function sameLayout(a: readonly Placement[], b: readonly Placement[]): boolean {
  const key = (l: readonly Placement[]) => JSON.stringify(restack(l).map((p) => [p.stickerId, p.x, p.y, p.scale, p.rot]));
  return key(a) === key(b);
}
