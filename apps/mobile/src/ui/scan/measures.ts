// The Scan page's measurements from the drawings, named once.
/**
 * M31 W6-B (T071; design-pulse2 shell.html `scan--screen`, `scan--camera-denied`, `scan--camera-preview`). The drawing is a 390 x 844
 * phone with a 50 pt status bar (`below(safeTop, y)` in src/ui/paused/measures.ts turns a drawn `top` into the screen's).
 *
 *   Before the camera is allowed: the glow (-80, 45 %), a 240 square at 110 with four light corners (48, 4 thick, radius 14) round a
 *   124 glowing QR tile, and low: "Scan a QR code" (30), the reason (15), then Close (52 circle) beside Allow camera (light, 52).
 *   Allowed: the camera in a window 16 in from each side, 58 down, 358 tall, radius 32, with hot corner marks (32, 4 thick, 20 in)
 *   and a hot scan line 30 in from each side; the hint at 440 ("Point at a QR code" 22, the line 14); low: "Scan QR code" (26) over Close and Torch (48).
 */
export const SCAN = {
  glowTop: -80, glowStrength: 0.45,
  frameTop: 110, frame: 240, bracket: 48, thick: 4, bracketRadius: 14, tile: 124,
  button: 52, rowGap: 10, wordsGap: 12, rowTop: 6,
  windowTop: 58, windowSide: 16, windowHeight: 358, windowRadius: 32,
  mark: 32, markInset: 20, markRadius: 10, lineInset: 30, lineThick: 2, lineGlow: 7, hintTop: 440, hintGap: 6, torch: 48,
} as const;
