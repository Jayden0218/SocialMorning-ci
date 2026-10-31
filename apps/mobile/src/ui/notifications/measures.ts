// The numbers Friends listening is drawn with, copied from the drawing.
/**
 * M31 W4-C (T052). Source: `design-pulse2/discover.html` `flBody`, `friends-listening--*`. A Deck of 250 x 160 cards (radius 24,
 * padding 14, 8 between parts) 10 apart in the 28 / 16 lane, then a Thread: the player's avatar 40 with a 3 void ring, 12 left of a
 * raise card (cover 48, Play 36), nodes 14 apart. Sizes are styles, not classes: the token check reads class names.
 */
export const FRIENDS = {
  /** The deck starts 8 under the status bar (58 on the drawing) and is followed by 18 before the spine. */
  topBelowStatus: 8,
  deckBelow: 18,
  deckWidth: 250,
  deckHeight: 160,
  deckRadius: 24,
  deckPad: 14,
  deckGap: 8,
  deckSpace: 10,
  deckAvatar: 28,
  deckCover: 34,
  followHeight: 30,
  followPadX: 12,
  noteTilePad: 14,
  nodeGap: 14,
  rowGap: 12,
  avatar: 40,
  ring: 3,
  cover: 48,
  playHeight: 36,
} as const;
