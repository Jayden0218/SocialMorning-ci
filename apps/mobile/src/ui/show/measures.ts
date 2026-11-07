// The Show screen's measurements from the drawing, and the sums behind them.
/**
 * M31 W3-A2 (T040, design-pulse2 `listen.html` `showBody`, entry `show--screen`, layout Mosaic + Stage). Drawn on a 390 x 844 phone
 * with a 50 status bar and a 34 home strip; a taller status bar moves the top parts down by the difference (as the Episode page does).
 *
 *   stage     the show art 300 tall at 85 %, under a veil that goes clear -> void over 310
 *   circles   search and ... , 44, 62 from the top (12 under the status bar), 20 from the right, 8 apart; glass (void-raise at 70 %)
 *   chips     156 from the top, 36 tall, 28 from the left, 5 apart; the sort and Unplayed chips follow, to scroll to
 *   mosaic    starts 206 from the top, 28 from the left and 16 from the right, rows 84, 10 apart: the newest episode is 2 x 2
 *             (178), the others 2 x 1 (84)
 *   thumb     20 from each side, 40 from the bottom: hosts line, back + title + one line of description, then the buttons
 *   fade      430 tall, from the bottom
 */
import { episode, showGlass } from '@/design/tokens';

export const SHOW = {
  statusBar: episode.statusBar,
  stageHeight: 300,
  stageOpacity: 0.85,
  veilHeight: 310,
  circle: 44,
  circlesTop: 12,
  circlesGap: 8,
  circleFill: showGlass,
  chipsTop: 106,
  chipsGap: 5,
  mosaicTop: 156,
  lane: 28,
  right: 16,
  tileRadius: 22,
  rowHeight: 84,
  rowGap: 10,
  bigHeight: 178,
  rowCover: 56,
  rowCoverRadius: 14,
  rowBars: 26,
  rowBarsHeight: 14,
  bigPlay: 40,
  rowPlay: 36,
  fade: 430,
  side: 20,
  hostAvatar: 22,
  hostOverlap: 8,
  deckCard: { width: 290, height: 340, radius: 26, cover: 150, pad: 14, bars: 30, barsHeight: 20, play: 40 },
  similarCard: { width: 150, cover: 150, radius: 22 },
} as const;

/** The status bar's extra height (a notch taller than the drawn 50) moves the top parts down. */
export function showShift(statusInset: number): number {
  return Math.max(statusInset, SHOW.statusBar) - SHOW.statusBar;
}

/** Where the list's first tile starts, measured from the top of the list (the list starts at the top of the screen). */
export function mosaicTop(statusInset: number): number {
  return SHOW.statusBar + SHOW.mosaicTop + showShift(statusInset);
}

/** Where the chip row starts from the top of the screen. */
export function chipsTop(statusInset: number): number {
  return SHOW.statusBar + SHOW.chipsTop + showShift(statusInset);
}
