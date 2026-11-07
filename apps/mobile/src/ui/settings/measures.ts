// The numbers the Settings pages are drawn with (design-pulse2 settings.html helpers), named once.
/**
 * M31 S-B (T060 part 2). `page()` puts the content 14 under the status bar (body top 58 + 6 of padding on a 50 bar), 28 in from
 * the left for the edge-label lane (16 without one) and 16 from the right, blocks 12 apart. A group row is 60 tall with 13 / 16 of
 * padding and 12 between its parts; a tile has 16 of padding and 10 between parts; a large switch tile is 112 tall with 14 of
 * padding. The type sizes the scale has no step for (the 14 / 22 lede, the 13 / 18 line in Geist 400, the 12-pt mono state) are
 * here with the drawing's own line heights, never shorter than the font draws (Geist 1.30, Unbounded 1.24).
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });
/** Caps with letter spacing (a hidden item's kind, Shared / Why). */
const caps = (fontSize: number, lineHeight: number, letterSpacing: number): { fontSize: number; lineHeight: number; letterSpacing: number; textTransform: 'uppercase' } => ({ fontSize, lineHeight, letterSpacing, textTransform: 'uppercase' });

export const SET = {
  /** Under the status bar. */
  top: 14,
  lane: 28,
  noLane: 16,
  right: 16,
  gap: 12,
  radius: 22,
  tilePad: 16,
  tileGap: 10,
  rowPadY: 13,
  rowPadX: 16,
  rowMin: 60,
  rowGap: 12,
  rowIcon: 22,
  rowChevron: 18,
  rowLineGap: 2,
  bigPad: 14,
  bigMin: 112,
  bigGap: 10,
  bigIcon: 24,
  bigStateGap: 4,
  /** Between two large tiles. */
  tilesGap: 10,
  /** The title bar's foot buttons (Start the check, Copy the result): 52 tall, 10 apart, 20 from each side. */
  footButton: 52,
  footGap: 10,
  footSide: 20,
  /** A quiet pill inside a tile (Restore 36, Unmute 34, Email me a link 40). */
  pillRestore: 36,
  pillUnmute: 34,
  pillMail: 40,
  pillPad: 14,
  /** The segmented track: raise-2, 4 of padding and between, radius 18; a choice 36, radius 14. */
  segPad: 4,
  segRadius: 18,
  segChoice: 36,
  segChoiceRadius: 14,
  /** The group rows' divider starts 16 in. */
  /** Network: the status dot and a host row. */
  dot: 10,
  hostMin: 64,
  /** Not interested / Updates: ghost and empty offsets. */
  emptyTop: 140,
  storeTop: 200,
  /** Privacy. */
  heroIcon: 28,
  mutedAvatar: 36,
  mutedRowPadY: 10,
  chipHeight: 36,
  /** Push: show tiles. */
  showCover: 48,
  showPad: 12,
  openGap: 4,
  openIcon: 14,
  /** Widgets. */
  leadIcon: 26,
  partyPad: 14,
  partyCapGap: 4,
  stepNumberWidth: 14,
  widgetListGap: 14,
  widgetWide: 120,
  widgetSquare: 60,
  widgetHeight: 60,
  widgetRadius: 14,
  widgetPad: 7,
  widgetSquareMark: 12,
  widgetBar: 4,
  /** Backups: the spine. */
  spineLeft: 11,
  spineWidth: 2,
  nodeSize: 12,
  nodeLeft: -29,
  nodeTop: 14,
  threadPad: 34,
  threadGap: 14,
  spineInset: 6,
  backupGap: 6,
  backupsEmptyTop: 120,
  /** OPML. */
  stepDot: 28,
  opmlStat: 56,
  pasteRadius: 18,
  pasteMin: 80,
  pasteMinFilled: 96,
  pastePad: 14,
} as const;

export const SET_TYPE = {
  /** A lede at 14 / 22 in Geist 400 (the drawing's `lede(..., 'font-size:14px')`). */
  lede: t(14, 22),
  /** The kind over a hidden item's name: mono 11 in caps, 0.06 em. */
  kind: caps(11, 14, 0.66),
  /** A line under a row's name: Geist 400 13 / 18 in text-2. */
  line: t(13, 18),
  /** The small line inside a tile: 12 / 17 or 12 / 18. */
  line12: t(12, 18),
  /** Mono 12 under a large tile's name (state), mono 13 beside it, mono 11 for a host. */
  state: t(12, 16),
  mono13: t(13, 18),
  mono11: t(11, 16),
  mono15: t(15, 20),
  /** Geist 600 13 on a quiet pill. */
  pill: t(13, 18),
  /** The 12-wide big number "6" of Export: Unbounded 800 56. */
  stat: t(56, 62),
  /** A step's title: Unbounded 700 16. */
  step: t(16, 20),
  /** A tile's title in Unbounded 700 19 / 17 / 26. */
  hero19: t(19, 24),
  title17: t(17, 22),
  version26: t(26, 32),
  /** The release notes: Geist 400 13 / 19. */
  notes19: t(13, 19),
  /** Geist 500 16 / 23: the one line on the iPhone updates page. */
  store: t(16, 23),
  /** The chosen app's steps: Geist 400 14 / 21. The paste box: mono 12 / 18. */
  stepLine: t(14, 21),
  paste: t(12, 18),
  /** Number in a widget step, mono 13. */
  stepNumber: t(13, 18),
  /** Small caps over Shared / Why: mono 11, 0.1 em. */
  caps: caps(11, 14, 0.88),
  /** The lead sentence: Unbounded 700 17 / 1.25. */
  lead: t(17, 22),
  /** Geist 400 12 / 17 inside a party tile. */
  party: t(12, 17),
  /** Geist 600 14 section line above the shows tiles. */
  showsHead: t(14, 19),
  /** Geist 600 13 / 17 a show's name. */
  showName: t(13, 17),
} as const;
