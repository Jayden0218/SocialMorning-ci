// The numbers the chat thread, New chat and the shared state blocks are drawn with, copied from the drawings.
/**
 * M31 W4-C (T052). Source: `design-pulse2/social.html` (`chatBase`, `bubble`, `epMsg`, `chatNewBase`, `signIn`, `errBlock`) and
 * discover.html `errTile`, on the drawn 390 x 844 phone with a 50 pt status bar. `top` values are measured from the phone's top
 * edge; a page converts them with `belowStatus` (src/ui/comments/measures.ts). Sizes are styles, not classes: the token check
 * reads class names, and a number here is one the drawing wrote.
 */
export const CHAT = {
  // ---- the thread --------------------------------------------------------------------------------------------
  /** The spine starts 60 from the phone's top (10 under the status bar). */
  spineTop: 60,
  /** A bubble: raise (theirs) or hot (mine), radius 18 with a 6 tail corner, up to 236 wide, padding 10 / 13. */
  bubbleMax: 236,
  bubbleRadius: 18,
  bubbleTail: 6,
  bubblePadY: 10,
  bubblePadX: 13,
  /** Messages in one node are 6 apart. */
  bubbleGap: 6,
  /** The gap that starts a new node (a tick): 10 minutes. */
  tickGapMs: 10 * 60 * 1000,
  /** An episode message: a 236 card, padding 10, radius 18; cover 44 (radius 10); Play 32. */
  episodePad: 10,
  episodeCover: 44,
  episodeCoverRadius: 10,
  episodeGap: 10,
  episodePlay: 32,
  // ---- the thumb zone ----------------------------------------------------------------------------------------
  /** The name row: back (44), their avatar 36, the name, "open profile ›"; 8 of padding each side. */
  headerAvatar: 36,
  headerPadX: 8,
  headerGap: 10,
  /** The message box (min 52, radius 22, padding 0 16) and the hot Send circle (52); 8 between them. */
  boxMin: 52,
  boxMax: 120,
  boxRadius: 22,
  boxPadX: 16,
  send: 52,
  composerGap: 8,
  /** The attached-episode chip above the box. */
  chipRadius: 16,
  chipPadX: 12,
  /** "You can send messages while you both follow each other." — a dashed 56 note, padding 10 / 14, the people icon 20. */
  noteMin: 56,
  notePadY: 10,
  notePadX: 14,
  noteIcon: 20,
  // ---- New chat ----------------------------------------------------------------------------------------------
  /** The "SHARING" card: left and right 20, 58 from the top; cover 56 (radius 12), padding 10, radius 20. */
  sharingRadius: 20,
  sharingPad: 10,
  sharingCover: 56,
  sharingCoverRadius: 12,
  sharingGap: 12,
  /** The send-to list starts 146 from the top, the plain list 60. */
  gridTopSending: 146,
  gridTop: 60,
  tileAvatar: 36,
  tileGap: 10,
  sendChip: { height: 26, padX: 10 },
  // ---- the state blocks (signIn / errBlock / errTile) -------------------------------------------------------
  /** `center()`: left and right 24, the parts 12 apart, padding 0 12. */
  blockSide: 24,
  blockGap: 12,
  blockPadX: 12,
  /** The 64 raise circle with the lock or the wifi mark (26 / 28). */
  disc: 64,
  discLock: 26,
  discWifi: 28,
  /** The light Sign in button is at least 200 wide. */
  signInWidth: 200,
  /** The error tile: radius 22, padding 16, 12 between parts; left 28 (the lane), right 16. Its Retry is 40 tall. */
  tileRadius: 22,
  tilePad: 16,
  tileInnerGap: 12,
  retryHeight: 40,
} as const;
