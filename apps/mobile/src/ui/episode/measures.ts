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

// 039 I2: `EpisodeLayout` and `episodeLayout(insets)` (the drawn page's pill, curve and stage positions) went with EpisodeStage; the Episode page is a DetailPage.

/** The tray's measures are the player's (same bar: 60 tall, radius 22, 12 in from each side). */
export const TRAY = player;
