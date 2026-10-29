// The type sizes and numbers the Discover group's inner pages are drawn with, where the scale has no step for them.
/**
 * M31 W5-D (T064; design-pulse2 `discover.html` entries categories, chart, chart-rules, topic, academy, picks, issues,
 * issue, digest, report, plaza, play-latest). The drawings set Unbounded at sizes between the scale's steps (a rank at 64,
 * a total at 88, a tile title at 26) and a few offsets of their own; they are named here once so a screen writes
 * `style={PAGE_TYPE.rank64}` and the token check (which refuses a number written for type in a strict file) stays quiet.
 * Line heights are Unbounded's own (1.24, `FACE_LEADING`) rounded up, or the drawing's line where it is longer.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });
const unbounded = (size: number): { fontSize: number; lineHeight: number } => t(size, Math.ceil(size * 1.24));

export const PAGE_TYPE = {
  /** Unbounded 800: a rank on the chart's first tile (64, with a hot glow), on a 1 x 2 tile (30), on a row (20). */
  rank64: unbounded(64),
  rank30: unbounded(30),
  rank20: unbounded(20),
  /** The Report's listening time, 88. */
  total88: unbounded(88),
  /** A count on the Report's tiles, Unbounded 800 28. */
  count28: unbounded(28),
  /** Unbounded 800 at 22 / 24 / 26 / 28 / 34: a tile or a statement. */
  title22: unbounded(22),
  title24: unbounded(24),
  title26: unbounded(26),
  title34: unbounded(34),
  /** Unbounded 700 at 13 / 14 / 17: a small tile's title. */
  tile13: unbounded(13),
  tile14: unbounded(14),
  tile17: unbounded(17),
  /** Unbounded 600 at 15 / 16 / 17: the editors' note, the summary. */
  note15: t(15, 21),
  summary16: t(16, 23),
  quote17: t(17, 24),
  /** The number in a ring on a numbered thread, Unbounded 700 15. */
  ring15: unbounded(15),
  /** Geist 400 15 / 22 and 14 / 20: an article's body, a rule. */
  body15: t(15, 22),
  /** Geist 500 12 / 16 and 13 / 18. */
  small12: t(12, 16),
  lede13: t(13, 18),
  /** Geist 500 17 / 24: the Play latest line. */
  line17: t(17, 24),
  /** Geist Mono 500 11 on a 14 line. */
  mono11: t(11, 14),
  /** Geist Mono 600 11, spaced 0.08 em: a tile's eyebrow. */
  eyebrow: { ...t(11, 14), letterSpacing: 0.88 },
  /** The first letter laid over a past pick's cover, Unbounded 800 22. */
  letter22: unbounded(22),
} as const;

/** The drawn numbers. */
export const PAGE = {
  /** A page's body starts 58 from the top of the drawn phone (8 under its status bar); Academy's article and Daily picks at 64, a pick deck's and the digest's at 64 / 70. */
  body: 58,
  body64: 64,
  body70: 70,
  /** The mosaic: rows 84, 10 apart; a tile is radius 22 with 14 of padding. */
  row: 84,
  gap: 10,
  radius: 22,
  pad: 14,
  /** The Charts' tiles: the lead is 2 x 3, the next two 1 x 2, then 2 x 1. */
  lead: { w: 2, h: 3 },
  /** A numbered thread (Academy's article, an Issue): the ring is 36, 14 before the card; the spine is 2 wide at x 36; the list is 18 from the left, 16 / 20 from the right. */
  ring: 36,
  ringGap: 14,
  spineX: 36,
  threadLeft: 18,
  threadRight: 16,
  /** A card on those threads: raise, 18 or 20 round, 12 or 14 of padding. */
  card: { article: { radius: 18, pad: 14 }, issue: { radius: 20, pad: 12 } },
  /** The Past picks thread: the spine at x 44, a card 46 in, the date chip 2 up and down. */
  pastSpine: 44,
  pastCard: 46,
  /** A pick's Deck card (Daily picks): 290 x 470, cover 240. */
  daily: { width: 290, height: 470, cover: 240 },
  /** The digest's Deck cards 290 x 230, cover 72. */
  digest: { width: 290, height: 230, cover: 72 },
  /** A topic's Deck cards 290 x 430, cover 200. */
  topic: { width: 290, height: 430, cover: 200 },
  /** The Report's top cards 250 x 84, cover 56. */
  top: { width: 250, height: 84, cover: 56 },
  /** The wall of the Plaza: a cover is 92, 8 apart, tilted 6 degrees. */
  /** The Plaza's fade is 340 tall (the wall shows through to the bar) and its error tile sits at 90. */
  plazaFade: 340,
  /** Play latest's block sits 240 from the top of the phone. */
  playLatestTop: 240,
  plazaError: 90,
  wall: { tile: 92, gap: 8, tilt: 6, radius: 20 },
} as const;
