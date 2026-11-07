// The Creator centre's numbers, read off the drawing and named once.
/**
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` `creator--screen`, `--signed-out`, `--host-proven`, `--code-pending`, `--code-not-found`; layout Deck). A 390 x 844 phone,
 * a 50 pt status bar: each `top` is measured from the status bar. The stage (curve 48 x 54, "Claim the show you publish", the explanation) starts 16 under it; the
 * "Claim" deck 64 below the explanation (the drawing's 300), cards 132 wide 12 apart, the first at the 28 lane; the Creator academy card (62, radius 20)
 * 36 under the deck. A claim card replaces the stage: raise, radius 22, 16 of padding, 10 between parts; the cover 72 (pending) or 88 (proven). The foot is the
 * title bar ("Creator centre" at 26) with the feed field (48) and the buttons (48) under it.
 */
export const CREATOR = {
  top: 66 - 50,
  side: 20,
  lane: 28,
  gap: 12,
  curveBars: 48,
  curveHeight: 54,
  /** The deck follows the stage 64 below (the drawing's 300 less where the three-line explanation ends); it follows a claim card 32 below. */
  deckGapStage: 64,
  deckGapCard: 32,
  deckEdgeTop: 20,
  deckCard: 132,
  deckCardRadius: 20,
  deckGap: 12,
  deckNameGap: 6,
  academyGap: 36,
  academyHeight: 62,
  academyRadius: 20,
  academyPad: 16,
  academyGapInside: 12,
  academyIcon: 24,
  academyChevron: 18,
  card: { radius: 22, pad: 16, gap: 10, coverPending: 72, radiusPending: 16, coverProven: 88, radiusProven: 18, headGap: 12, headTextPending: 4, headTextProven: 6, momentGap: 10, curveBars: 60, curveHeight: 46 },
  /** The foot: the field 48 (radius 18, 14 of padding, a 20 globe, 10 apart) and the buttons 48, 12 apart. */
  field: 48,
  fieldRadius: 18,
  fieldPad: 14,
  fieldGap: 10,
  footGap: 12,
  glowTop: -160,
  glowStrength: 0.45,
  titleSize: 26,
  /** Signed out: a 120 mic tile 120 under the status bar, tilted 6 degrees left; the sentence 290 under it. */
  outTile: 120,
  outTileTop: 170 - 50,
  outTextTop: 340 - 50,
  outSide: 24,
  outGlowTop: -140,
} as const;

/** The stage's picture: 48 bars of a made-up show's reaction curve (decoration — it carries no data). */
export const STAGE_CURVE: readonly number[] = Array.from({ length: 100 }, (_, k) => Number((0.3 + 0.7 * Math.abs(Math.sin(k * 0.21) * Math.cos(k * 0.083 + 1))).toFixed(3)));
