// The numbers the Settings hub and its pages are drawn with (design-pulse2 settings.html).
/**
 * M31 S-A (T060). `settings.html` builds every Settings page from the same few parts: `page()` (the body starts 58 from the
 * top of the drawn phone, 6 of padding, a 28 lane on the left for the edge label and 16 on the right, 12 between parts),
 * `group()` / `row()` (a raise tile, radius 22, rows at least 60 tall, 13 / 16 of padding, 12 between the icon, the words
 * and the chevron, a 1 px rule between rows), `tile()` (raise, radius 22, padding 16, 10 between parts) and `big()` (a large
 * 2 x 2 tile: radius 22, padding 14, 112 tall, a switch tile that is ON is tinted with a hot ring). Measured from the drawing,
 * named here once. A size the type scale has no step for is in `SET_TYPE`, so no page writes a number in a style
 * (`scripts/token-check.mjs`). Line heights are the font's own where the drawing's would crop it on Android.
 */
import { radius, spacing } from '@/design';

export const SET = {
  /** The drawn body starts at 58 + 6 = 64 from the top of the phone, 14 under its 50 status bar. */
  top: 14,
  lane: 28,
  right: 16,
  /** A page with no edge lane (licences, a package, how-for-you) keeps 16 on both sides. */
  side: spacing.section,
  gap: spacing.row,
  radius: radius.artworkLarge,
  tilePad: spacing.section,
  tileGap: 10,
  rowMin: 60,
  rowPadX: spacing.section,
  rowPadY: 13,
  rowGap: spacing.row,
  rowIcon: 22,
  chevron: 18,
  lineGap: 2,
  bigMin: 112,
  bigPad: 14,
  bigGap: 10,
  bigIcon: 24,
  /** The edge label sits 2 below its section's top. */
  edgeTop: 2,
  /** The hub's hero tile ("Account and security") is at least 88 tall: avatar 52, 14 between. */
  heroMin: 88,
  heroAvatar: 52,
  heroGap: 14,
  /** A 36 tall pill (Sign out on a device row, Unblock). Touch: `hitSlop` brings it to 48. */
  pill: 36,
  pillPad: 14,
  /** A 40 tall pill inside a tile (Clear cache, Open Wallet, Unblock). */
  pill40: 40,
  button: 52,
} as const;

const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

export const SET_TYPE = {
  /** Geist Mono 500 at the drawing's sizes: a state line 12, a detail 13, a masked address 14, an address 15. */
  mono11: t(11, 15),
  mono12: t(12, 16),
  mono13: t(13, 18),
  mono14: t(14, 20),
  mono15: t(15, 21),
  /** Geist Mono 12 on a 19 line: a licence text. */
  licence12: t(12, 19),
  /** Geist 400 12 / 17: a line under a field or a tile. */
  line12: t(12, 17),
  /** Geist 400 13 / 18: the line under a row's name. */
  line13: t(13, 18),
  /** Geist 400 14 / 21 and 15 / 22: a note and a lede. */
  note14: t(14, 21),
  lede15: t(15, 22),
  /** Geist 500 16 / 23: the iPhone line on the screen-off page. */
  lead16: t(16, 23),
  /** Geist 600 12 / 16 (a mono-caps label's neighbour) and Geist 600 13 / 16 (a document tile's name). */
  tag10: t(10, 14),
  doc13: t(13, 17),
  /** Unbounded: the hero's name 17, the email heading 20, the four-digit steps 26, the count 64, the size 56 / 40, units 22 / 18. */
  display17: t(17, 22),
  display20: t(20, 25),
  display26: t(26, 33),
  display28: t(28, 35),
  count64: t(64, 80),
  size56: t(56, 70),
  size40: t(40, 50),
  unit22: t(22, 28),
  unit18: t(18, 24),
  /** Unbounded 800 34 / 44: the document number on How For You (the drawing's `01`). */
  number34: t(34, 43),
  /** Unbounded 800 44 / 55: the count on a collected item's sheet. */
  count44: t(44, 55),
  /** Geist Mono 500 20: the closed How For You tile's number. */
  mono20: t(20, 26),
  /** Geist 400 14 / 20 and 15 / 21: a field's words. */
  field15: t(15, 21),
  /** The passcode cells: Unbounded 700 26. */
  cell26: t(26, 33),
} as const;
