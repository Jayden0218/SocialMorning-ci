// The type sizes the Me tab's list pages are drawn with, where the scale has no step for them.
/**
 * M31 W3-C (T041). The drawings set a few sizes the Pulse scale has no step for: the day tag and the counts in mono 11,
 * the show line under a card title in Geist 500 11, a person's name at 13 and a node's label at 12. They live here, named,
 * and a screen writes `style={ME_TYPE.mono11}` — a number written in a style in a strict file is refused by
 * `scripts/token-check.mjs`. Line heights are the drawing's (1.2–1.3), never shorter than the font draws a line.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

export const ME_TYPE = {
  /** Geist Mono 600 11 in a 22 tall tag: the day tags of History. */
  dayTag: t(11, 20),
  /** Geist Mono 500 11: ages, "Stopped at", "Finished", counts. */
  mono11: t(11, 14),
  /** Geist 500 11: the show under a card's title. */
  show11: t(11, 14),
  /** Geist 500 12: "On {episode}" beside a chip, "liked · 2h". */
  node12: t(12, 16),
  /** Geist 600 13: a person's name on a node. */
  name13: t(13, 18),
  /** Geist 600 14: the name on the Like page's stage and on its comment cards. */
  name14: t(14, 18),
  /** Unbounded 800 32: the time on a Saved moments card's cover. */
  momentTime: t(32, 40),
  /** Unbounded 700 16 / 18: a moment's or an episode card's title. */
  cardTitle16: t(16, 20),
  cardTitle18: t(18, 23),
  /** Unbounded 800 28 (Favourites' title is the title bar's); the empty Stage's title at 24 and 22. */
  stage24: t(24, 30),
  stage22: t(22, 28),
  /** Unbounded 800 22: a playlist's name on its 2 x 2 tile. */
  tile22: t(22, 27),
  /** Unbounded 700 13 (a 1 x 1 tile's title) and Geist 700 13 (a Favourites tile's). */
  tile13: t(13, 16),
  /** Unbounded 800 52: the total on Listening data. */
  total52: t(52, 58),
  /** Unbounded 800 38: the All time total (me-listening--all-time), one line. */
  total38: t(38, 43),
  /** Unbounded 800 24: a rank on a Top shows card. */
  rank24: t(24, 30),
  /** Unbounded 700 20: the playlist name being renamed. */
  rename20: t(20, 25),
  /** Geist 500 15 in a field (placeholder and typed words). */
  field15: t(15, 20),
} as const;
