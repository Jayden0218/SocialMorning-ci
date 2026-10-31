// The drawn type sizes that sit between the type scale's steps, named once.
/**
 * M31 wave-2 fix. A drawing sometimes sets a size the scale has no step for (the Saved moments count at 40,
 * a card title at 15 / 16 / 17, the queue's 11 / 14 line). Those numbers live here, with a name, and a screen
 * writes `style={drawnType.count}`; a number written in a style in a strict file is refused by
 * `scripts/token-check.mjs` (`STRICT_STYLE_FILES`). Line heights are the font's own (Unbounded 1.24 — `FACE_LEADING`
 * — or the drawing's), rounded up; letter spacing is the drawing's em value times the size.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });
const size = (fontSize: number): { fontSize: number } => ({ fontSize });
const line = (lineHeight: number): { lineHeight: number } => ({ lineHeight });
const track = (letterSpacing: number): { letterSpacing: number } => ({ letterSpacing });

export const drawnType = {
  /** Unbounded 700 at the sizes the discover cards are drawn in (title 15 / 16 / 17). */
  unbounded: { 15: t(15, 19), 16: t(16, 20), 17: t(17, 22) },
  /** The count on Saved moments: Unbounded 800 40 (the `figure` step is 34). */
  count: t(40, 46),
  /** The cover letters on a cover without a picture. */
  coverMark: t(28, 34),
  /** "Play on mobile data?" */
  prompt: t(28, 35),
  /** Queue deck: the number (mono 11), "Downloaded" (mono 10), the show (11 / 14), the title (14 / 18 and 16 / 20), the time left (11 / 14). */
  queueNumber: t(11, 11),
  queueBadge: t(10, 10),
  queueShow: t(11, 14),
  queueTitle: t(14, 18),
  queueTitleLarge: t(16, 20),
  queueLeft: t(11, 14),
  /** A transcript line, and the live or chosen one. */
  transcript: t(16, 24),
  transcriptLive: t(18, 26),
  /** A Me tile's note line (Saved moments, PLUS, month report): Geist 500 12 on a 16 (design-pulse2 `tile` notes), under the `caption` step's 13 / 18. */
  tileNote: t(12, 16),
  /** The Chat list's card: the name is drawn on a 15 line, the last message on 17.5 (`chat--screen`); the steps' 20 made a card 5 taller. */
  chatName: line(16),
  chatPreview: line(17),
  /** A Search tab's label is drawn on a 14 line (`font:600 14px/1`); the `compact` step's 18 put the tab row 4 higher than drawn. */
  searchTab: line(16),
  /** The comment count beside the page title, and the composer's text. */
  commentCount: t(14, 20),
  composer: t(16, 24),
  /** A parent comment on the thread page, a comment in the moment sheet, a rule, and the Now bar's ticker. */
  threadParent: line(27),
  momentBody: line(21),
  rule: line(20),
  ticker: line(16),
  /** The launch screen's seconds count. */
  launchCount: size(13),
  /** Letter spacing: 0.04 em of 11 (the host pin), 0.08 em of 11 (the eyebrow), 0.1 em of 11 (mono caps), 1.3 (the caps eyebrow). */
  trackPin: track(0.44),
  trackEyebrow: track(0.88),
  trackMono: track(1.1),
  trackCaps: track(1.3),
};
