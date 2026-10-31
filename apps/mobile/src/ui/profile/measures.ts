// The numbers the profile-side pages are drawn with: people, followers, subscriptions, edit profile, stickers.
/**
 * M31 W4-A (T050; design-pulse2 `social.html` profile-followers / -following / -subscriptions / -edit,
 * stickers / stickers-decorate / stickers-help entries). The Mosaic is the Me tab's (`ME_MOSAIC`: two columns,
 * rows 84, 10 apart, radius 22, padding 14, 28 lane on the left, 16 on the right); this file holds only what
 * those drawings add. A size the type scale has no step for is named in `PROFILE_TYPE`, so no screen writes a
 * number in a style (`scripts/token-check.mjs`, `STRICT_STYLE_FILES`). Line heights are the font's own.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

export const PROFILE = {
  /** The mosaic starts 58 from the top of the drawn phone (8 under its 50 status bar); its first edge label sits 12 in. */
  mosaicTop: 58,
  labelTop: 12,
  /** A person's tile: avatar 40, 10 beside it. */
  avatar: 40,
  avatarGap: 10,
  /** A compact Follow pill inside a tile (drawn 32 tall; `hitSlop` brings the touch to 48). */
  followHeight: 32,
  followSlop: 8,
  /** A show's tile is 1 x 2: two rows and the gap between. */
  showTileRows: 2,
  /** The centred blocks (sign in / could not load) hold a 64 disc, 12 below it the line; 24 from each side. */
  disc: 64,
  discIcon: 28,
  blockSide: 24,
  blockGap: 12,
  blockButton: 200,
  /** The inline error tile at the top of the mosaic: padding 16, radius 22, 10 between. */
  errorPad: 16,
  errorGap: 10,
  retryHeight: 40,
  /** Edit profile: photo 88 inside a 3 light ring; 10 between the photo and its chips; the form starts 206 from the top. */
  photo: 88,
  photoRing: 3,
  photoTop: 56,
  photoGap: 10,
  photoChip: 36,
  photoChipPad: 14,
  formTop: 206,
  tileRadius: 20,
  tilePadY: 12,
  tilePadX: 14,
  tileGap: 8,
  fieldGap: 10,
  smallChipHeight: 32,
  smallChipPad: 11,
  chipGap: 6,
  /** Stickers: the hero tile 2 x 2, a sticker circle 40 in a tile, its progress bar 3 tall. */
  heroPad: 14,
  heroFloatA: 56,
  heroFloatB: 44,
  circle: 40,
  circleRing: 1.5,
  barHeight: 3,
  cardCircle: 132,
  cardRing: 3,
  /** Decorate: the stage 250 tall (radius 28) 20 from each side; the deck's card is 96 x 118. */
  stageHeight: 250,
  stageRadius: 28,
  stageSide: 20,
  stageTop: 58,
  stageAvatar: 84,
  stageHeadTop: 40,
  hintBottom: 10,
  deckCardW: 96,
  deckCardH: 118,
  deckGap: 12,
  deckSticker: 48,
  badge: 18,
  nudge: 38,
  nudgeRadius: 12,
  actionHeight: 42,
  /** Help: rows with a 34 circle; the page's tiles 22 radius. */
  helpCircle: 34,
  helpRowPad: 9,
} as const;

export const PROFILE_TYPE = {
  /** Geist 400 11/15 text3: a person's bio line under their name. */
  bio11: t(11, 15),
  /** Geist 600 12: a field tile's label ("Name"), 12 / 16. */
  label12: t(12, 16),
  /** Geist 400 12/16 text3: the note under a tile. */
  note12: t(12, 16),
  /** Geist 600 12/15 and mono 10: a sticker tile's title and its day. */
  stickerTitle: t(12, 15),
  stickerDay: t(10, 14),
  /** Unbounded 800 34: "3 of 8 earned" on the hero tile (the `figure` step is 34 with a 34 line). */
  heroFigure: t(34, 42),
  /** Unbounded 800 30 / Unbounded 800 20: a sticker card's name; the decorate stage's name. */
  cardName: t(30, 37),
  stageName: t(20, 25),
  /** Unbounded 700 14: a show's title on its tile. */
  showTitle: t(14, 18),
  /** Geist 500 11 mono: the "drag to move" hint, the sticker deck's name 11. */
  hint11: t(11, 15),
  deckName: t(11, 14),
  /** Geist 600 13 / 12: a help row's title and its line. */
  helpTitle: t(13, 17),
  helpLine: t(12, 16),
  /** Geist 400 13/19 text2: help's closing note. */
  helpNote: t(13, 19),
  /** Geist 500 15 / 21: the bio field, 16 / the name field. */
  field16: t(16, 20),
  bio15: t(15, 21),
  /** Mono 15 hint in an empty birthday / industry field. */
  mono15: t(15, 20),
} as const;

/**
 * M31 D-C (design-pulse2 `social.html` `profile--screen` and its variants). The Stage: its words start 62 from the top of the drawn phone (12
 * under the 50 status bar), the photo is 104 inside a 3 light ring (110 across), the name 14 under it (6 + 8), the lines 6 apart and 40 in
 * from each side; the Numbers grid starts 52 under the last line. The stickers' tiles: the circle 34, the gap 10.
 */
export const PROFILE_PAGE = {
  stageTop: 12,
  photo: 104,
  photoRing: 3,
  photoInner: 3,
  nameGap: 14,
  lineGap: 6,
  stageSide: 40,
  gridGap: 52,
  glowTop: -200,
  glowStrength: 0.5,
  glowQuiet: 0.15,
  /** A blocked or suspended page's line sits 6 lower (`margin-top: 6`). */
  quietLine: 6,
  /** Tiles: a label then its content, 10 / 12 apart. */
  tileLabelGap: 10,
  podCover: 92,
  podRadius: 16,
  stickerCircle: 34,
  libraryCell: 72,
  /** The bar: back 44, Follow flex, two 48 circles, 10 apart. */
  barGap: 10,
  barCircle: 48,
  /** The collapsed name: the avatar 28. */
  collapsedAvatar: 28,
  collapsedAt: 150,
  /** A playlist's deck card. */
  playlistWidth: 230,
  playlistHeight: 96,
  playlistCover: 64,
  playlistCoverRadius: 14,
} as const;
