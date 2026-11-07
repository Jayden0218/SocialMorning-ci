// The Episode page's measurements from the drawing, and the sums behind them.
/**
 * M31 W3-A (T040, design-pulse2 `listen.html` `episodeBody` / `epTitle` / `epTray`): the numbers live in
 * `src/design/tokens.ts` (`episode`); this file adds the sums. On a 390 × 844 phone with a 50 / 34 inset the page is
 * exactly the drawing's; a taller status bar moves the top parts down.
 *
 * The bottom: the root layout pads the home strip once for every page but the player (guard G-T1, `bottom-bar.test.ts`), so the
 * page's bottom offsets are measured from the top of that strip: the drawing's 40 (tray) and 112 (title block) are 34 + 6 and
 * 34 + 78 on the drawn phone, and a taller strip moves them up by itself — nothing here reads the bottom inset.
 */
import { episode, player } from '@/design/tokens';

export const EPISODE = episode;

export type EpisodeLayout = {
  /** The pills row's top edge. */
  pillsTop: number;
  curveTop: number;
  /** Where the sections start: under the stage (the cover's height, moved down by a taller status bar). */
  stageHeight: number;
  /** Distance from the top of the home strip (the root pads it) to the title block's bottom, and to the tray's. */
  titleBottom: number;
  trayBottom: number;
};

/** The page's positions for the status bar's height. */
export function episodeLayout(insets: { top: number }): EpisodeLayout {
  const status = Math.max(insets.top, episode.statusBar);
  const shift = status - episode.statusBar;
  return {
    pillsTop: status + episode.pillsBelowStatus,
    curveTop: episode.curveTop + shift,
    stageHeight: episode.coverHeight + shift,
    titleBottom: episode.titleBottom - episode.homeInset,
    trayBottom: episode.trayBottom - episode.homeInset,
  };
}

/** The tray's measures are the player's (same bar: 60 tall, radius 22, 12 in from each side). */
export const TRAY = player;
