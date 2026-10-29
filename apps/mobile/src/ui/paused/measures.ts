// The paused pages' measurements from the drawings, named once: maintenance, the crashed screen, and the appeal page's curve.
/**
 * M31 W6-B (T071; design-pulse2 shell.html `maintenance--screen`, `error-boundary--screen`, `appeal--screen`). The drawing is a 390 x 844
 * phone with a 50 pt status bar; every `top` here is the drawing's own, and `below(safeTop, y)` turns it into the screen's (the
 * device's status bar replaces the drawn 50). Words and buttons are drawn from the bottom.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

/** The drawn status bar's height. */
export const STATUS_BAR = 50;

/** Where a drawn `top` lands on a device whose status bar is `safeTop` tall. */
export function below(safeTop: number, drawnTop: number): number {
  return safeTop + drawnTop - STATUS_BAR;
}

export const MAINTENANCE = {
  glowTop: -60, glowStrength: 0.5,
  curveTop: 150, curveCount: 40, curveHeight: 150, gapFrom: 17, gapTo: 22,
  marksTop: 316, wordsBottom: 196, wordsGap: 10, buttonsBottom: 40, buttonsGap: 10, button: 52,
} as const;

export const CRASH = {
  glowTop: -60, glowStrength: 0.4,
  curveTop: 170, curveCount: 40, curveHeight: 120, gapFrom: 15, gapTo: 24,
  discTop: 205, disc: 52, wordsBottom: 120, wordsGap: 12, buttonsBottom: 40, button: 52,
} as const;

export const APPEAL = {
  glowTop: -200, glowStrength: 0.35,
  curveTop: 70, curveCount: 46, curveHeight: 64, gapFrom: 20, gapTo: 26,
  cardsTop: 156, edgeTop: 170, cardsLeft: 28, cardsRight: 16, cardGap: 12,
  cardPad: 16, cardRadius: 22, cardInner: 10, boxMin: 110, boxRadius: 16, boxPad: 12,
  doneTile: 96, doneGap: 14, doneTilt: -6, doneTop: 90, lockTop: 60, lockIcon: 26, send: 48,
} as const;

/** Type the scale has no step for: the 16 and 17 lines (1.45 line height), the "!" in the crash disc (Unbounded 800 26), the box's 15 / 22 text. */
export const pausedType = { line16: t(16, 23), line17: t(17, 25), bang: t(26, 32), box: t(15, 22), counter: t(12, 18), small12: t(12, 17), small13: t(13, 19), sign16: t(16, 23) } as const;
