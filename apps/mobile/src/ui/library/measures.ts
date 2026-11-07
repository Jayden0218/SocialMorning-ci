// The numbers the Updates tab and My subscriptions are drawn with, from the Pulse drawings.
/**
 * M31 D-A (T031; design-pulse2 `index.html#updates--screen`, `listen.html#subscriptions--screen`, `--grid`, `--show-menu`). Every
 * number is read off those drawings. The drawn phone has a 50 high status bar; a block "drawn at N from the top" sits `N - 50`
 * under the safe top (`DRAWN.status`).
 *
 *  - Voice: an edge label and a row of 56 circles 12 apart from 28 in, each with a 2 void gap and a 2 ring round it (the
 *    drawing's two box-shadows), the name under at 6; the block is drawn at 58 and the Starred block at 150 (92 pitch).
 *  - Starred: an edge label and 52 covers (radius 14) 10 apart from 28 in; the Deck is drawn at 220 (70 pitch).
 *  - Deck: cards 290 x 350 (radius 26, a 1 line), 10 apart, the first at 20; cover 150; body padding 14, 8 between; actions 40, Play 46.
 *  - Subscriptions: tiles in the Me lane (28 left, 16 right); a starred tile 1 x 2 (178), a show 2 x 1 (84, padding 12, cover 56);
 *    the grid is 3 columns of squares (radius 18, 8 apart).
 */
import { radius } from '@/design';

export const UPDATES = {
  /** Voice drawn at 58, Starred at 150, Deck at 220 (from the top of the drawn phone). */
  voiceTop: 58,
  starredTop: 150,
  deckTop: 220,
  lane: 28,
  voice: { avatar: 56, gap: 12, ring: 2, name: 6 },
  starred: { cover: 52, gap: 10, radius: 14 },
  card: { width: 290, height: 350, radius: 26, cover: 150, pad: 14, gap: 8, lead: 20, chipLeft: 12, chipTop: 12, chipPadX: 7, chipPadY: 5, chipRadius: 6, action: 40, play: 46, actionGap: 6 },
  /** A swipe up or down on a card must travel this far (points), and lean more up/down than sideways. */
  swipe: { distance: 64, lean: 1.5, start: 10 },
} as const;

export const SUBS = {
  /** The mosaic is drawn at 70 from the top of the phone. */
  top: 70,
  starredHeight: 178,
  starredCols: 2,
  tilePad: 12,
  cover: 56,
  coverRadius: 14,
  menuCover: 56,
  grid: { cols: 3, gap: 8, radius: 18, star: 14, starInset: 6 },
  /** The ··· on a show tile: 18 drawn, 48 touched. */
  more: 18,
} as const;

const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });
export const LIB_TYPE = {
  /** Unbounded 700 19 on a 1.15 line, the deck card's title (Unbounded's own line is taller: 24). */
  cardTitle: t(19, 24),
  /** Geist 500 12 / Mono 500 11: the show above the title, the cover chip, a tile's "Updated 2d ago". */
  show12: t(12, 16),
  mono11: t(11, 14),
  /** Geist 600 14 on a show tile; Unbounded 700 16 in the show menu's head; Unbounded 700 14 on a starred tile. */
  tile14: t(14, 18),
  menuTitle: t(16, 20),
  starredTitle: t(14, 18),
} as const;

export const CARD_RADIUS = UPDATES.card.radius;
export const VOICE_PITCH = UPDATES.starredTop - UPDATES.voiceTop;
export const STARRED_PITCH = UPDATES.deckTop - UPDATES.starredTop;
export const TILE_RADIUS = radius.artworkLarge;
