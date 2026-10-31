// The clip page's and the clip composer's measurements from the drawings, named once.
/**
 * M31 W3-B (T041; design-pulse2 `listen.html` `clip--screen`, `clip-new--screen`). The drawing is a 390 x 844 phone with a 50 pt status bar
 * and a 34 pt home inset (the root pads the strip; the drawn 40 is the strip plus 6).
 *
 *   Clip page: the top bar 12 under the status bar, the signed-out strip 66, the ring 200 at 160, the low stack 86 from the foot, the buttons 6;
 *   the ring's stroke 8 and disc 110 (glyph 40); the curve 60 bars x 22; the title Unbounded 28.
 *   Composer: the ring 280 at 20 under the status bar, the range arc 6 thick 2 outside it; Start / End 22 under the ring; the chips 36 tall,
 *   8 apart; the caption field 48.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

export const CLIP_RING = { size: 200, stroke: 8, disc: 110, glyph: 40 } as const;
export const CLIP_PAGE = { barTop: 12, stripTop: 66, ringTop: 160, stackBottom: 86, curveBars: 60, curveHeight: 22, shareCircle: 48, glass: 44, pill: 32, endPillsTop: 40, emptyTop: 210 } as const;
export const COMPOSER = { ring: 280, ringTop: 20, arc: 6, arcOutset: 2, arcMin: 0.02, rowGap: 22, chip: 36, nudgeGap: 8, grab: 0.08, field: 48, buttons: 48, caption: 200, fieldPad: 14 } as const;
/** The New clip page's empty blocks start under the status bar by the drawings' 260 / 240 less their 50 pt bar. */
export const COMPOSER_EMPTY = { missing: 210, signedOut: 190 } as const;

/** Type the scale has no step for: "by Rui" (12), the title (Unbounded 28 / 35), the length (Unbounded 26 / 33). */
export const clipsType = { by: t(12, 16), title: t(28, 35), length: t(26, 33) } as const;
