// The queue page's and the playlist chooser's measurements from the drawings, named once.
/**
 * M31 W3-B (T041; design-pulse2 `listen.html` `queue--screen`, `queue--conflict-chooser`). The drawing is a 390 x 844 phone with a
 * 50 pt status bar and a 34 pt home inset; offsets are from the page's top (under the status bar) or its foot.
 *
 *   Deck: cards 290 x 330, 10 apart, the first at the 28 lane, the cover 46 % of the card, 14 of padding, the curve 30 bars x 22,
 *   Play 44, ··· 40, Play now 40 tall; under it four dots (4 high, the current one 18 wide, 6 apart) and the strip's tiles (cover 36, radius 16).
 *   Chooser: two tiles 10 apart (radius 22, padding 14, 10 between parts), covers 30 overlapping by 8 in a 2 line.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

export const QUEUE_CARD = { width: 290, height: 330, gap: 10, coverShare: 0.46, pad: 14, bars: 30, curve: 22, play: 44, more: 40, pill: 40, tick: 26, lane: 28 } as const;
/** One card plus the gap: the snap distance, and what a sideways drag moves a card by one place. */
export const QUEUE_PITCH = QUEUE_CARD.width + QUEUE_CARD.gap;
/** The deck starts 60 under the status bar; the empty block 210 (the drawings' 110 and 260 on a 50 pt bar). */
export const QUEUE_PAGE = { deckTop: 60, emptyTop: 210, edgeTop: 10, heatCards: 2 } as const;
/** The dots: 4 high; the current one 18 wide, the others 6, 6 apart, 14 under the deck. */
export const QUEUE_DOTS = { height: 4, on: 18, off: 6, gap: 6, top: 14, max: 10 } as const;
/** The strip's tiles: 8 apart, 8 padding, cover 36, radius 16, 20 under the dots. */
export const QUEUE_TILE = { gap: 8, pad: 8, cover: 36, radius: 16, top: 20 } as const;
export const CHOOSER = { tileGap: 10, tilePad: 14, partGap: 10, cover: 30, overlap: 8, coverLine: 2, coverRadius: 8, outline: 1.5 } as const;

/** Type the scale has no step for: the card's number tag (mono 11), the show and strip lines (12). */
export const queueType = { tag: t(11, 14), show: t(12, 16), strip: t(12, 15), sub: t(12, 16) } as const;
