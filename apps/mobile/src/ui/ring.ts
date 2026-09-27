/**
 * A progress ring without SVG: two half rings, each clipped to one half of the circle
 * and turned. A half ring drawn with two coloured border sides and turned 45° covers
 * exactly one half; turning it a further −180° hides it behind the clip. So:
 *   right half shows progress 0 → 0.5, left half shows 0.5 → 1.
 */
export function ringAngles(progress: number): { right: number; left: number } {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return {
    right: -135 + Math.min(p, 0.5) * 360,
    left: -135 + Math.max(0, p - 0.5) * 360,
  };
}
