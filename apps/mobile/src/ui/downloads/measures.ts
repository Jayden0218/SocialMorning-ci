// The Downloads page's measurements from the drawings, named once.
/**
 * M31 W3-B (T041; design-pulse2 `listen.html` `downloads--screen`, `-settings`, `-select-mode`; `dlTile`, `mosaic`). The drawing is a 390 x 844
 * phone with a 50 pt status bar and a 34 pt home inset.
 *
 *   Mosaic: two columns from the 28 lane to 16 off the right, 10 apart, rows 84 (a tile is 1 x 2 = 178), groups 10 apart.
 *   Tile: radius 22, padding 14, cover 56, the ring 40 (stroke 4), the title and state 12 from the foot, Retry 32 tall.
 *   Settings panel: rows 56 tall, 14 of padding, radius 20, 12 apart; the budget ring 56 (stroke 5), the chips three across, 8 apart.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

export const DOWNLOAD_TILE = { height: 178, pad: 14, cover: 56, foot: 12, tick: 24, retry: 32, retryGap: 6, retryPad: 12, gap: 10, lane: 28, right: 16 } as const;
export const DOWNLOAD_RING = { size: 40, stroke: 4, budgetSize: 56, budgetStroke: 5 } as const;
/** The scroll starts 20 under the status bar (the drawing's 70 under a 50 pt one); the empty block 190 (240). */
export const DOWNLOADS_PAGE = { top: 20, emptyTop: 190, sectionGap: 10, panelGap: 12, panelRadius: 20, panelPad: 14, rowMin: 56, rowIcon: 34, chipGap: 8 } as const;

/** Type the scale has no step for: a tile's title (13 / 16), the ring's percent (mono 10), a panel row's detail (12 / 16). */
export const downloadsType = { title: t(13, 16), percent: t(10, 14), detail: t(12, 16) } as const;
