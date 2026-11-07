// The status pages' measurements from the drawings, named once.
/**
 * M31 W4-B (T051; design-pulse2 `social.html` `statusBase`, `textBase`, `addEpSheet`, `signIn`, `itemsRow`; `status--*`, `status-text--*`,
 * `status-composer-items--toast`). The drawing is a 390 x 844 phone with a 50 pt status bar; every `*Top` below is measured from the status bar
 * (the drawing's number less 50), every `*Bottom` from the page's foot (the drawing's less the 34 pt home strip, which the root layout pads).
 *
 * The Stage (a status): segments 4 under the bar (3 tall, 4 apart, 14 in); the head row 18 under it (avatar 36, name, "18 h left", the
 * "Suggested" tag, More 44); the body 90 under it (a 56 play circle and a 56 tall wave, the clock, the words in Unbounded 21, episode cards and photos);
 * the foot: reactions (chips 36), the "Reacted:" line and the replies, 76 over the bar; the bar (Close 44 and the 52 reply box) 6 over the foot.
 * The text status (a Panel with the words as the stage): the 230 card 14 under the bar, its words in Unbounded 24, the items row, the item rows.
 */
const t = (fontSize: number, lineHeight: number): { fontSize: number; lineHeight: number } => ({ fontSize, lineHeight });

export const STAGE = {
  segTop: 4, segSide: 14, segHeight: 3, segGap: 4, segRadius: 2,
  headTop: 18, headSide: 16, headGap: 10, avatar: 36, tagHeight: 24, tagPad: 9, tagRadius: 12,
  bodyTop: 90, bodyGap: 16, play: 56, playIcon: 20, wave: 56, waveBars: 46, waveMin: 4, waveGap: 12, glowTop: -140, glowStrength: 0.45,
  /** The gradient's end: `#060608 62%` (the start is `stageTint`, at 170 degrees). */
  gradientEnd: 0.62,
  card: { pad: 10, gap: 10, radius: 18, play: 40, playIcon: 14, cover: 48 },
  photoRadius: 16, photoRatio: 4 / 3,
  /** What the body leaves at its foot so the last item is not hidden behind the foot (the foot at its tallest, plus a breath). */
  bodyReserve: 270,
  fade: 300,
  /** The foot's column and the bar. */
  footGap: 10, aboveBar: 76, barSide: 12, barGap: 8, barBottom: 6, boxHeight: 52, boxRadius: 22, boxPadLeft: 14, boxPadRight: 4, send: 40, sendPad: 14, mic: 44, keyboardGap: 8,
  chip: { height: 36, pad: 11, gap: 6, radius: 18, emoji: 16, inner: 5, slop: 6 },
  reply: { pad: 8, padX: 10, radius: 14, avatar: 22, gap: 8, rows: 6, maxHeight: 130, slop: 5 },
} as const;

export const TEXT_PAGE = {
  cardTop: 14, cardMin: 230, cardRadius: 26, cardPad: 18, gap: 14, errorLine: 28,
  glowTop: -240, glowStrength: 0.35,
  item: { pad: 10, radius: 18, gap: 10, cover: 48, rowGap: 10 },
  /** The sign-in block sits 200 under the status bar (the drawing's 250 less the bar). */
  signInTop: 200,
} as const;

export const ITEMS = {
  chipGap: 8, countUp: 6, count: 11,
  /** "Add an episode": the deck's cards are 150 wide with a 130 cover, 10 apart. */
  card: { width: 150, pad: 10, radius: 20, cover: 130, gap: 8, between: 10 },
} as const;

export const SIGN_IN = { circle: 64, gap: 12, pad: 12, button: 200, buttonUp: 4 } as const;
export const CHOOSER_ROW = { height: 52, tile: 40, tileRadius: 12, gap: 14 } as const;

/** Type the scale has no step for: the words of a status (Unbounded 700 21 / 27 — 1.24 is the font's own line), the text card (24 / 30), the tag, counts, chips and the reply rows. */
export const statusType = {
  words: t(21, 27),
  cardWords: t(24, 30),
  suggested: t(11, 16),
  count13: t(13, 16),
  note12: t(12, 17),
  name13: t(13, 18),
  hold10: t(10, 14),
  deckTitle: t(13, 16),
  deckShow: t(10, 14),
  emoji: t(16, 20),
} as const;

/**
 * A status has no waveform of its own (the server keeps none, the drawing's wave is the sample heat), so the wave is drawn from its id:
 * the same status always looks the same. 0–1 per bucket, 100 buckets (the Curve reads them).
 */
export function waveFor(id: string, buckets = 100): number[] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out: number[] = [];
  for (let k = 0; k < buckets; k++) {
    h ^= k + 1; h = Math.imul(h, 16777619);
    const r = ((h >>> 0) % 1000) / 1000;
    out.push(0.25 + 0.75 * r * (0.55 + 0.45 * Math.sin((k / buckets) * Math.PI)));
  }
  return out;
}

/** The share of a voice status played so far, 0–1 (the segment and the wave fill by it). */
export function playedShare(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 0;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}
