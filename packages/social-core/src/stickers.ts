// The sticker catalogue, the rules for placing stickers on a profile, and the day each listening sticker was earned.
/**
 * M21 US9. The catalogue (ids and what earns each) lived on the phone only (apps/mobile
 * src/me/stickers.ts); it is here so the server can refuse a placement of a sticker that does
 * not exist. The server does NOT check that the listener has earned the sticker they place —
 * "earned" is still worked out on the phone (it counts this phone's own listening too).
 *
 * Placements (the sticker canvas, our own design — owner 2026-10-06): positions are fractions of
 * the canvas width and height, so the layout is the same on every phone.
 */
import { crossingDay, type ListenedRow } from './stats';

export type StickerMetric = 'listenedHours' | 'finished' | 'moments' | 'comments';
export type StickerRule = { id: string; metric: StickerMetric; need: number };

/** In display order. An id is never reused for a different sticker: placements store it. */
export const STICKER_RULES: readonly StickerRule[] = [
  { id: 'hour-1', metric: 'listenedHours', need: 1 },
  { id: 'hour-10', metric: 'listenedHours', need: 10 },
  { id: 'hour-42', metric: 'listenedHours', need: 42 },
  { id: 'hour-100', metric: 'listenedHours', need: 100 },
  { id: 'finish-1', metric: 'finished', need: 1 },
  { id: 'finish-25', metric: 'finished', need: 25 },
  { id: 'moment-1', metric: 'moments', need: 1 },
  { id: 'comment-1', metric: 'comments', need: 1 },
];

export const STICKER_IDS: readonly string[] = STICKER_RULES.map((r) => r.id);
export const isStickerId = (id: string): boolean => STICKER_IDS.includes(id);

/** At most this many stickers on one profile header. */
export const PLACEMENT_MAX = 10;
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2.5;
/**
 * A turn is kept within ± one full circle (radians). Exactly 2π, not the database's 6.2832: the
 * column is `real`, and 6.2832 stored as a real reads back as 6.28320026…, which its own CHECK refuses.
 */
export const ROT_MAX = 2 * Math.PI;
export const Z_MAX = 9;

export type Placement = { stickerId: string; x: number; y: number; scale: number; rot: number; z: number };
export type PlacementCheck = 'ok' | 'too_many' | 'unknown_sticker' | 'duplicate' | 'out_of_bounds';

const within = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;

/** Whether a whole set of placements may be saved (a PUT replaces them all). */
export function checkPlacements(items: readonly Placement[]): PlacementCheck {
  if (items.length > PLACEMENT_MAX) return 'too_many';
  const seen = new Set<string>();
  for (const p of items) {
    if (!isStickerId(p.stickerId)) return 'unknown_sticker';
    if (seen.has(p.stickerId)) return 'duplicate';
    seen.add(p.stickerId);
    const ok = within(p.x, 0, 1) && within(p.y, 0, 1) && within(p.scale, SCALE_MIN, SCALE_MAX) && within(p.rot, -ROT_MAX, ROT_MAX) && Number.isInteger(p.z) && within(p.z, 0, Z_MAX);
    if (!ok) return 'out_of_bounds';
  }
  return 'ok';
}

/**
 * The day each listening-hours sticker was earned, from the server's own listened rows: the day
 * the running total first reached its hours. Stickers earned some other way are left out (their
 * day is not known to the server).
 */
export function listeningStickerDays(rows: readonly ListenedRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of STICKER_RULES) {
    if (r.metric !== 'listenedHours') continue;
    const day = crossingDay(rows, r.need * 3_600_000);
    if (day !== undefined) out[r.id] = day;
  }
  return out;
}
