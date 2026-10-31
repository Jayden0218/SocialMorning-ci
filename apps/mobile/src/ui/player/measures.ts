// The player page's measurements from the drawing, and the sums behind them.
/**
 * M31 T024, round 2 (design-pulse2 `index.html#player--screen`, `listen.html` `playerBody`): the numbers
 * live in `src/design/tokens.ts` (`player`); this file adds the sums. The drawing is a 390 × 844 phone with a
 * 50 pt status bar and a 34 pt home inset:
 *
 *   top row 58 · ring 330 at 118 (cover 205) · time bubble 298 · title block bottom 226 ·
 *   controls bottom 124 (play 80, skips 30, moon 44) · tray bottom 40, 60 tall, radius 22
 *
 * `playerLayout` turns those into the positions for a real window: the top numbers move down with a taller
 * status bar, the bottom numbers move up with a taller home inset, and the ring shrinks only when the
 * window is too short to hold it above the title block.
 */
import { player } from '@/design/tokens';

export const PLAYER = player;

/** Where each part of the page sits on this window (all in points, from the top or bottom edge). */
export type PlayerLayout = {
  ring: number;
  /** The top row's top edge. */
  topBarTop: number;
  ringTop: number;
  /** The time bubble's top edge. */
  bubbleTop: number;
  titleBottom: number;
  controlsBottom: number;
  trayBottom: number;
  offerBottom: number;
  emptyTextBottom: number;
  emptyPillsBottom: number;
};

/** M31 F13 (widths W2): the least ring. It was 200, which on a 320 x 568 phone ran the ring into the title block (the room there is 120). */
const RING_FLOOR = 96;

/**
 * The ring's size for this window: 330, or less when the window cannot hold it — never wider than the window
 * less 30 each side, and never so tall that it runs into the title block (the room between the ring's top and
 * the title block's top, `titleRoom` high for two lines and the show line).
 */
export function ringSize(window: { width: number; height: number }, insets: { top: number } = { top: 0 }): number {
  const status = Math.max(insets.top, player.statusBar);
  const room = window.height - player.titleBottom - player.titleRoom - (status + player.ringBelowStatus) - 8;
  return Math.round(Math.max(RING_FLOOR, Math.min(player.ring, window.width - 60, room)));
}

/** The page's positions: exactly the drawing's on a 390 × 844 phone with a 50 / 34 inset. */
export function playerLayout(window: { width: number; height: number }, insets: { top: number; bottom: number }): PlayerLayout {
  const status = Math.max(insets.top, player.statusBar);
  const lift = Math.max(0, insets.bottom - player.homeInset);
  const ring = ringSize(window, insets);
  const ringTop = status + player.ringBelowStatus;
  return {
    ring,
    topBarTop: status + player.topBarBelowStatus,
    ringTop,
    bubbleTop: ringTop + ring / 2 + player.bubbleBelowCentre,
    titleBottom: player.titleBottom + lift,
    controlsBottom: player.controlsBottom + lift,
    trayBottom: player.trayBottom + lift,
    offerBottom: player.offerBottom + lift,
    emptyTextBottom: player.emptyTextBottom + lift,
    emptyPillsBottom: player.emptyPillsBottom + lift,
  };
}
