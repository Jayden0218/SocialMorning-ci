// The size math for comment pictures: shrink to fit, and the thumbnail's box.
/**
 * M20 US9 (spec FR-053). Pure, so it is tested without a phone: `fitWithin` is what the photo is
 * shrunk to before upload (long side ≤ 1600, never enlarged); `thumbSize` is the row's thumbnail
 * (the picture's shape inside a square, never under the 48 pt tap floor).
 */
export const IMAGE_LONG_SIDE = 1600;

export function fitWithin(w: number, h: number, max: number = IMAGE_LONG_SIDE): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max || long <= 0) return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
  const k = max / long;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export function thumbSize(w: number, h: number, max: number, floor: number): { width: number; height: number } {
  const k = Math.min(max / w, max / h, 1);
  return { width: Math.max(floor, Math.round(w * k)), height: Math.max(floor, Math.round(h * k)) };
}
