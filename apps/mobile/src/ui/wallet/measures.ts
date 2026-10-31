// The numbers and type sizes the Wallet, Tips, Gift, Redeem and Creator centre pages are drawn with, named once.
/**
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` entries creator--*, wallet--*, tips--screen, gift--*, redeem--*; helpers `low`, `card`,
 * `big`, `line`, `cap`, `glowTile`, `markTile`, `plusCard`, `redeemRow`, `walletPhone`, `redeemPhone`, `giftPhone`). The drawing is a 390 x 844 phone
 * with a 50 pt status bar; every `top` below is measured from the status bar (the drawing's number less `STATUS`), every `bottom` from the title
 * bar's bottom edge (the drawing's less the pushed page's 40). Type the scale has no step for is here with the drawing's own size and a line that is
 * never shorter than the font draws (Unbounded 1.24, Geist 1.30), so Android does not crop it.
 */
import { FACE_LEADING } from '@/design/tokens';

/** The status bar the drawings assume. */
export const STATUS = 50;

/** Unbounded 800 (`big`): the size, a line of the font's own height, -1 % tracking. */
const display = (size: number): { fontSize: number; lineHeight: number; letterSpacing: number } => ({ fontSize: size, lineHeight: Math.ceil(size * FACE_LEADING.display), letterSpacing: size * -0.01 });
/** Geist at the drawing's size; its line is the drawing's 1.45 (`line()`), never under the font's 1.30. */
const t = (fontSize: number, lineHeight: number, letterSpacing?: number): { fontSize: number; lineHeight: number; letterSpacing?: number } => (letterSpacing === undefined ? { fontSize, lineHeight } : { fontSize, lineHeight, letterSpacing });
const geist = (size: number, line: number = Math.round(size * 1.45)): { fontSize: number; lineHeight: number } => ({ fontSize: size, lineHeight: Math.max(line, Math.ceil(size * FACE_LEADING.ui)) });

export const STAGE_TYPE = {
  big20: display(20),
  big22: display(22),
  big24: display(24),
  big26: display(26),
  big28: display(28),
  big30: display(30),
  big34: display(34),
  big40: display(40),
  /** Geist 500 at 13 / 14 / 15 / 17 (`line(text, colour, size)`). */
  line13: geist(13),
  line14: geist(14),
  line15: geist(15),
  line17: geist(17),
  /** Mono 11 caps, 0.08 em (`cap`). */
  cap: { ...t(11, 14, 0.88), textTransform: 'uppercase' as const },
  /** The redeem field: Geist Mono 600 20, 0.12 em. */
  code: t(20, 26, 2.4),
  /** The creator's code: Unbounded 800 34, 0.04 em. */
  claimCode: t(34, Math.ceil(34 * FACE_LEADING.display), 1.36),
  /** The "!" in a mark tile: Unbounded 800 28. */
  mark: display(28),
  /** A pill's words: Geist 700 12 on a 26 line. */
  pill: t(12, 26),
  /** Mono 15 (an amount), 12 (a count), 11 (the end-of-list mark, 0.1 em). */
  mono15: t(15, 20),
  small12: t(12, 16),
} as const;

/** Wallet (`walletPhone`): the tiles start 12 under the status bar, 28 in from the left (the PLUS edge label's lane), 20 from the right. */
export const WALLET = {
  top: 62 - STATUS,
  lane: 28,
  right: 20,
  gap: 12,
  radius: 22,
  pad: 16,
  cardGap: 10,
  /** The PLUS card's buttons: 42 tall, 8 apart. */
  buttonHeight: 42,
  buttonGap: 8,
  gem: 30,
  /** The PLUS label sits 80 - 62 = 18 under the tiles' top. */
  edgeTop: 80 - 62,
  /** "Redeem a code": a 56 row, radius 18. */
  rowMin: 56,
  rowRadius: 18,
  rowPad: 16,
  rowGap: 12,
  rowIcon: 22,
  rowChevron: 16,
  /** The empty wallet's hero tile. */
  heroHeight: 170,
  heroPad: 18,
  heroGap: 10,
  heroGlow: 150,
  heroGlowOffset: -30,
  heroGlowOpacity: 0.6,
  heroIcon: 40,
  heroIconRight: 26,
  heroIconTop: 24,
  pillHeight: 26,
  pillPad: 10,
  /** A purchase: 64 tall, radius 18, 12 / 16 of padding. */
  tileMin: 64,
  tileRadius: 18,
  tilePadY: 12,
  tilePadX: 16,
  tileGap: 12,
  /** The load error: a 48 mark tile beside the line. */
  markSize: 48,
  markPadY: 14,
  markPadX: 4,
  markGap: 12,
  /** The title bar's store sentence is three lines at 13. */
  storeLines: 4,
} as const;

/** Tips (`tips--screen`): a 160 heart tile tilted 6 degrees left, a faint wall of 60 bars, the words 150 over the foot. */
export const TIPS = {
  tile: 160,
  tileTop: 150 - STATUS,
  tileRotate: -6,
  wallTop: 120 - STATUS,
  wallHeight: 220,
  wallMin: 20,
  wallBars: 60,
  wallSide: 20,
  glowTop: -90,
  glowStrength: 0.5,
  /** The words sit 150 up from the phone's foot; the title bar's own foot is 40 up. */
  wordsAbove: 150 - 40,
  wordsGap: 12,
  /** The title is smaller on this page (the headline says what it is). */
  titleSize: 20,
  /** A tip in the list: the same 64 tile as a purchase, under the status bar like any list. */
  listGap: 10,
  listTop: 12,
} as const;

/** Gift (`giftPhone`, `gift--not-found`). */
export const GIFT = {
  cover: 240,
  coverRadius: 36,
  coverTop: 96 - STATUS,
  coverGlowRadius: 45,
  coverGlowOpacity: 0.55,
  badge: 56,
  badgeIcon: 28,
  badgeOffset: -12,
  badgeRing: 4,
  textTop: 372 - STATUS,
  textGap: 10,
  textSide: 20,
  glowTop: -60,
  glowStrength: 0.6,
  titleSize: 24,
  /** The link that does not work. */
  deadTile: 140,
  deadTop: 150 - STATUS,
  deadSentenceTop: 340 - STATUS,
  deadSide: 24,
  deadGlowStrength: 0.4,
  /** The page names the loading state with the shared loader this far down. */
  loadTop: 200,
} as const;

/** Redeem (`redeemPhone`): a 140 ticket tile tilted 6 degrees right, the words 300 from the top, the field 56. */
export const REDEEM = {
  tile: 140,
  tileTop: 110 - STATUS,
  tileRotate: 6,
  textTop: 300 - STATUS,
  textSide: 24,
  textGap: 10,
  glowTop: -120,
  glowStrength: 0.45,
  titleSize: 24,
  field: 56,
  fieldRadius: 18,
  fieldPad: 14,
  /** The error line (14 on 20) and its gap above the button. */
  errorLine: 20,
  belowGap: 12,
  /** The done tile. */
  doneRadius: 22,
  donePad: 16,
  doneGap: 12,
  doneIcon: 24,
} as const;
