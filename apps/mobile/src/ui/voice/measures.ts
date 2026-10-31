// The voice status page's measurements from the drawings, named once.
/**
 * M31 W3-B (T041; design-pulse2 `social.html` `voiceBase`, `recRing`, `voice-new--*`). The drawing is a 390 x 844 phone with a 50 pt status bar.
 *
 *   Rules: three tiles 8 apart, 10 under the status bar (circle 22, padding 10, 6 apart); the ring 270 (stroke 10) at 120 under the bar;
 *   the clock Unbounded 800 40, "/ 1:00" 600 16; the record button 84; the review at 408, the items row alone at 420 (the drawing's 458 / 470);
 *   the glow 120 above the screen, 30 % strong (55 % while recording).
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

export const VOICE_RING = { size: 270, stroke: 10, inset: 7, button: 84, glowInset: 34, glowRadius: 30, stop: 26, stopRadius: 6, lineGap: 10 } as const;
export const VOICE_PAGE = { rulesTop: 10, tilePad: 10, tileGap: 8, number: 22, ringTop: 120, reviewTop: 408, itemsTop: 420, belowRing: 18, glowTop: -120, glowIdle: 0.3, glowRecording: 0.55, deniedTop: 200, deniedIcon: 64, errorLine: 28 } as const;

/** Type the scale has no step for: the clock (40 / 50), "/ 1:00" (16 / 20), the rule line (12 / 16), the number (mono 11), the denied sentence (16 / 22), the caps line (mono 10). */
export const voiceType = { clock: t(40, 50), cap: t(16, 20), rule: t(12, 16), number: t(11, 14), denied: t(16, 22), caps: t(10, 14) } as const;
