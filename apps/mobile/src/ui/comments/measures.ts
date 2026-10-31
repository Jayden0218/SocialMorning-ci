// The numbers the Pulse comments pages are drawn with, copied from the drawings.
/**
 * M31 W2-B (T032). Source: `design-pulse2/social.html` (`commentsBase`, `cmt`, `node`, `spine`, `srow`,
 * `composer`, `recordBar`, `threadBase`) and `index.html#comments--screen`, on the drawn 390 × 844 phone with a
 * 50 pt status bar and a 34 pt home inset. `top` values are measured from the status bar's bottom edge (the drawing's
 * `top: 56` is 6 under the bar), so a device with another status bar moves the page by the difference; `bottom` values
 * from the home strip's top edge (the drawing's `bottom: 40` is 6 over it) — the root layout pads that strip, so a page
 * starts above it (`ZONE_BOTTOM`).
 *
 * Sizes are styles, not classes: the token check only reads class names, and a number here is one the drawing wrote.
 */
export const COMMENTS = {
  /** The drawing's frame. */
  statusBar: 50,
  homeInset: 34,
  gutter: 20,
  // ---- top: the episode strip and the map -------------------------------------------------------------------
  /** The strip's top (56) is 6 under the status bar. */
  stripBelowStatus: 6,
  stripCover: 36,
  stripCoverRadius: 10,
  stripGap: 10,
  pause: 36,
  /** The map's top (102) is 10 under the strip (56 + 36). */
  mapGap: 10,
  mapBars: 80,
  mapHeight: 26,
  mapGapBars: 1,
  mapMin: 2,
  /** Where the position line sits is the played share; it is 2 wide and as tall as the bars. */
  line: 2,
  /** The spine's top (140) is 12 under the map's foot (102 + 26 = 128). */
  mapToSpine: 12,
  /** The listening-now discs at the map's right end. */
  liveDisc: 20,
  liveOverlap: 6,
  liveMax: 3,
  liveGap: 10,
  // ---- the spine ----------------------------------------------------------------------------------------------
  spineX: 40,
  spineWidth: 2,
  /** The list's padding: 10 over the first node, 18 to its left, 20 to its right. */
  listTop: 10,
  listLeft: 18,
  listRight: 20,
  /** Between nodes. */
  nodeGap: 18,
  /** A node's head (chip + "n reacted") sits 10 above its cards. */
  nodeInner: 10,
  /** The chip's column: 46 wide, the chip centred on the spine. */
  chipColumn: 46,
  /** Cards sit 56 from the node's left edge, replies step in 30 more. */
  cardIndent: 56,
  replyStep: 30,
  /** A reply's age tick on the replies spine. */
  tickHeight: 20,
  tickPad: 6,
  tickRadius: 7,
  // ---- a card -----------------------------------------------------------------------------------------------
  cardRadius: 18,
  cardPad: 12,
  cardGap: 7,
  avatar: 24,
  hostTag: { height: 16, pad: 6, radius: 6 },
  actionGap: 16,
  heart: 16,
  /** The drawn pin line (`font: 600 11px/1` beside a 13 icon): 13 tall. */
  pinLine: 13,
  voiceDisc: 32,
  voiceBars: 26,
  voiceHeight: 22,
  voicePad: { v: 8, h: 10 },
  voiceRadius: 14,
  picture: { w: 150, h: 104, radius: 14 },
  // ---- the bottom zone ----------------------------------------------------------------------------------------
  /** `bottom: 40` = 6 over the home inset. */
  zoneAboveInset: 6,
  zoneSide: 12,
  zoneGap: 10,
  titleRowPad: 8,
  titleSize: 26,
  titleLine: 32,
  capsuleHeight: 40,
  capsulePad: 3,
  capsuleGap: 2,
  capsuleItemRadius: 17,
  capsuleItemPad: 14,
  optionsCircle: 40,
  composerHeight: 56,
  composerRadius: 22,
  composerPad: 6,
  recorderBorder: 1.5,
  send: 36,
  dot: 8,
  recordCheck: 40,
  recordBars: 24,
  // ---- the stage on the replies page --------------------------------------------------------------------------
  stageBelowStatus: 10,
  stageGap: 10,
  stageAvatar: 32,
  glowHeight: 520,
  glowOpacity: 0.35,
  /** The glow's top is 260 above the screen's top edge. */
  glowTop: -260,
  /** The replies spine starts 250 from the top = 200 under the status bar. */
  repliesSpineBelowStatus: 200,
  // ---- sheets -------------------------------------------------------------------------------------------------
  menuRow: 52,
  /** The Order sheet's spacer under its two rows (`social.html` `comments--order-options-sheet`). */
  orderFoot: 6,
  menuIcon: 40,
  menuIconRadius: 12,
  quoteRadius: 18,
  quotePad: 12,
  quoteAvatar: 22,
  reasonHeight: 52,
  reasonRadius: 16,
  noteHeight: 64,
  /** A text-only action under a pill (Cancel on the report sheet): one 14 line. */
  cancelHeight: 14,
  postHeight: 38,
  postPad: 16,
  momentCover: 44,
  momentCardRadius: 16,
  momentCardPad: 10,
  writeMin: 120,
  writeRadius: 18,
  writePad: 14,
  rulesRadius: 20,
  rulesPad: 16,
  /** The moment sheet's mini spine, 6 in from its left. */
  momentSpineLeft: 6,
  momentSpineIndent: 22,
  /** The thumb of a comment's picture sits in a 14-radius box; the badge is 14 with 3 pad. */
  badgePad: 3,
  badgeRadius: 8,
  badgeIcon: 14,
  fullHeight: 330,
  fullTop: 200,
} as const;

/**
 * The thumb zone's `bottom`: the drawing's 40 is 6 over its 34 pt home inset. The root layout pads the home strip once (a
 * `SafeAreaView` with `edges: bottom`, app/_layout.tsx; guard G-BB1), so a page positions from above that strip and the zone
 * is 6 up from its container's foot — the same place on every phone. (`useTabTitle` passes `safe = 0` for the same reason.)
 */
export const ZONE_BOTTOM = 6;

/** The status bar the drawing assumes → what this device has; every `top` moves by the difference. */
export function belowStatus(insetTop: number, drawnTop: number): number {
  return insetTop + (drawnTop - COMMENTS.statusBar);
}

/** The home inset the drawing assumes → what this device has; every `bottom` moves by the difference. */
export function aboveInset(insetBottom: number, drawnBottom: number): number {
  return insetBottom + (drawnBottom - COMMENTS.homeInset);
}

/** A card's left margin on the spine: 56, plus 30 per reply level. */
export function cardLeft(level: number): number {
  return COMMENTS.cardIndent + level * COMMENTS.replyStep;
}
