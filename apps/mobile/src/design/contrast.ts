// Measures colour contrast so every text colour stays easy to read.
/**
 * WCAG 2.x relative luminance and contrast ratio, so FR-014 is asserted rather than
 * assumed. The same formula was used to compute the palette in research R1; shipping it
 * means the gate re-checks every token pair on every run.
 */
import { ACCENTS, colour } from './tokens';

/** Accepts `#rgb`, `#rrggbb`, or `rgba(r,g,b,a)` composited over `over` (default black). */
export function relativeLuminance(value: string, over = '#000000'): number {
  const { r, g, b } = toRgb(value, over);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a, b);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A see-through colour as it looks drawn over a solid one — so a tint or veil is measured
 * against the page it actually sits on (the ratio function composites over black).
 */
export function over(value: string, base: string): string {
  const top = toRgb(value, base);
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex(top.r)}${hex(top.g)}${hex(top.b)}`;
}

export const BODY_MIN = 4.5;
export const LARGE_MIN = 3;

export type Pair = { fg: string; bg: string; min: number; role: string };

/**
 * Every foreground the app draws, against the background it is drawn on. M31 (T021): measured
 * on the Pulse palette before adoption (2026-10-27) — every text pair in `design-pulse2` is here,
 * the comment is the ratio. Text clears 4.5; a graphic that carries information clears 3.
 * The drawings' unplayed bars (white at 18–28 %, 1.6–2.4) did not, so `barIdle` is 40 % (3.73).
 */
export const PAIRS: Pair[] = [
  // Words on the three surfaces.
  { fg: colour.text, bg: colour.void, min: BODY_MIN, role: 'body text on the page' }, // 18.11
  { fg: colour.text, bg: colour.raise, min: BODY_MIN, role: 'text on a card' }, // 16.84
  { fg: colour.text, bg: colour.raise2, min: BODY_MIN, role: 'text on a sheet, field or dialog' }, // 15.48
  { fg: colour.text2, bg: colour.void, min: BODY_MIN, role: 'secondary text' }, // 7.95
  { fg: colour.text2, bg: colour.raise, min: BODY_MIN, role: 'secondary text on a card' }, // 7.39
  { fg: colour.text2, bg: colour.raise2, min: BODY_MIN, role: 'secondary text on a sheet' }, // 6.79
  { fg: colour.text3, bg: colour.void, min: BODY_MIN, role: 'caption, edge label' }, // 5.81
  { fg: colour.text3, bg: colour.raise, min: BODY_MIN, role: 'caption on a card' }, // 5.40
  { fg: colour.text3, bg: colour.raise2, min: BODY_MIN, role: 'caption, placeholder in a field' }, // 4.96
  { fg: colour.hotText, bg: colour.void, min: BODY_MIN, role: 'hot words, links' }, // 8.46
  { fg: colour.hotText, bg: colour.raise, min: BODY_MIN, role: 'hot words on a card' }, // 7.86
  { fg: colour.hotText, bg: colour.raise2, min: BODY_MIN, role: 'hot words on a sheet' }, // 7.23
  { fg: colour.ok, bg: colour.void, min: BODY_MIN, role: 'success words' }, // 11.46
  { fg: colour.warn, bg: colour.void, min: BODY_MIN, role: 'warning words' }, // 11.52
  { fg: colour.ok, bg: colour.raise, min: BODY_MIN, role: 'success words on a card' }, // 10.65
  { fg: colour.warn, bg: colour.raise, min: BODY_MIN, role: 'warning words on a card' }, // 10.71
  // T098 (converge G16): the pick's quoted note, the PREMIUM tag / gradient words, and the number on an accent badge.
  { fg: colour.quote, bg: colour.void, min: BODY_MIN, role: 'a quoted note, show line (text-quote) on the page' },
  { fg: colour.quote, bg: colour.raise, min: BODY_MIN, role: 'a quoted note on a card' },
  { fg: colour.quote, bg: colour.raise2, min: BODY_MIN, role: 'a quoted note on a sheet' },
  { fg: colour.hotEnd, bg: colour.void, min: BODY_MIN, role: 'the violet end of gradient words, the PREMIUM tag (text-hotEnd) on the page' },
  { fg: colour.hotEnd, bg: colour.raise, min: BODY_MIN, role: 'hotEnd words on a card' },
  { fg: colour.background, bg: colour.accent, min: BODY_MIN, role: 'the count on an accent badge (text-background on bg-accent)' },
  // Words on a solid fill: void on hot (tags, badges, hot button), void on text (light button, chosen chip).
  { fg: colour.void, bg: colour.hot, min: BODY_MIN, role: 'words on a hot button, tag or badge' }, // 6.30
  { fg: colour.void, bg: colour.text, min: BODY_MIN, role: 'words on a light button or chosen chip' }, // 18.11
  { fg: colour.text, bg: colour.raise, min: BODY_MIN, role: 'words on a quiet button' }, // 16.84
  { fg: colour.text, bg: colour.void, min: BODY_MIN, role: 'words on a ring button (outline on the page)' }, // 18.11
  { fg: colour.onPrimary, bg: colour.primary, min: BODY_MIN, role: 'words on the primary fill' }, // 6.30
  { fg: colour.onPlay, bg: colour.play, min: BODY_MIN, role: 'glyph on a main Play button' }, // 18.11
  { fg: colour.playGlyph, bg: colour.playDisc, min: BODY_MIN, role: 'play triangle on its disc' }, // 18.11
  { fg: colour.toastAction, bg: colour.text, min: BODY_MIN, role: 'the toast action on the light toast' }, // 5.92
  { fg: colour.void, bg: colour.text, min: BODY_MIN, role: 'toast words on the light toast' }, // 18.11
  // Timestamp chip: hot words on hot at 16 %.
  { fg: colour.hotText, bg: over(colour.hotSoft, colour.void), min: BODY_MIN, role: 'timestamp chip on the page' }, // 7.25
  { fg: colour.hotText, bg: over(colour.hotSoft, colour.raise), min: BODY_MIN, role: 'timestamp chip on a card' }, // 6.52
  { fg: colour.accent, bg: over(colour.accentTint, colour.void), min: BODY_MIN, role: 'play glyph on its tint' }, // 7.25
  { fg: colour.muted, bg: over(colour.accentTint, colour.void), min: BODY_MIN, role: 'secondary text on the tint' }, // 6.6
  // The now bar's glass, over the page.
  { fg: colour.text, bg: over(colour.glass, colour.void), min: BODY_MIN, role: 'now bar title' }, // 15.95
  { fg: colour.text2, bg: over(colour.glass, colour.void), min: BODY_MIN, role: 'now bar ticker' }, // 7.00
  { fg: colour.hotText, bg: over(colour.glass, colour.void), min: BODY_MIN, role: 'now bar hot ticker' }, // 7.45
  // The player's veil over a black cover (worst case), and the Segmented track.
  { fg: colour.text, bg: over(colour.veil, '#000000'), min: BODY_MIN, role: 'player text on the veil' },
  { fg: colour.text2, bg: over(colour.veil, '#000000'), min: BODY_MIN, role: 'player secondary text on the veil' },
  { fg: colour.muted, bg: colour.segment, min: BODY_MIN, role: 'an unchosen tab on the track' }, // 6.79
  { fg: colour.void, bg: colour.text, min: BODY_MIN, role: 'void words on the chosen tab' },
  // Graphics that carry information or identify a control (floor 3).
  { fg: colour.idle, bg: colour.void, min: LARGE_MIN, role: 'idle tab icon (graphic)' }, // 4.51
  { fg: colour.violet, bg: colour.void, min: LARGE_MIN, role: 'violet end of the gradient bars (graphic)' }, // 3.78
  { fg: colour.hot, bg: colour.void, min: LARGE_MIN, role: 'hot bars and the active dot (graphic)' }, // 6.30
  { fg: colour.hot, bg: colour.raise, min: LARGE_MIN, role: 'hot bars on a card (graphic)' }, // 5.85
  { fg: colour.barIdle, bg: colour.void, min: LARGE_MIN, role: 'unplayed heat bars and ring spokes (information)' }, // 3.73
  { fg: colour.barIdle, bg: colour.raise, min: LARGE_MIN, role: 'unplayed bars on a card (information)' }, // 3.5
  { fg: colour.bar, bg: colour.void, min: LARGE_MIN, role: 'heat bars (information)' },
  { fg: colour.outline, bg: colour.void, min: LARGE_MIN, role: 'a ring button\'s outline' }, // 4.86
  { fg: colour.text2, bg: colour.switchOff, min: LARGE_MIN, role: 'a switch\'s thumb on its off track' }, // 5.28
  { fg: colour.void, bg: colour.hot, min: LARGE_MIN, role: 'a switch\'s thumb on its on track' }, // 6.30
];

/**
 * M12 guard G-A1b (FR-108): every accent theme on the Pulse surfaces. The brand theme
 * ("sunrise") is left out: its pairs are the ones above.
 */
export const ACCENT_PAIRS: Pair[] = Object.entries(ACCENTS).filter(([name]) => name !== 'sunrise').flatMap(([name, t]) => [
  { fg: t.light.accent, bg: colour.void, min: BODY_MIN, role: `${name}: links on the page` },
  { fg: t.light.accent, bg: colour.raise, min: BODY_MIN, role: `${name}: links on a card` },
  { fg: t.light.accent, bg: colour.raise2, min: BODY_MIN, role: `${name}: links on a sheet` },
  { fg: t.light.onPrimary, bg: t.light.primary, min: BODY_MIN, role: `${name}: words on the fill` },
  { fg: t.light.accent, bg: over(t.light.accentTint, colour.void), min: BODY_MIN, role: `${name}: timestamp chip and play glyph on its tint` },
  { fg: t.light.primary, bg: colour.void, min: LARGE_MIN, role: `${name}: bars and dot (graphic)` },
]);

/**
 * Pairs shipped below their floor, knowing the number. Empty since M17 (constitution v3.0.0:
 * "no contrast waiver"; v4.0.0 keeps it); guard G-E1 fails if anything is added back.
 */
export const WAIVED: (Pair & { why: string })[] = [];

/** What the gate reports: every pair that does not clear its floor. */
export function failures(pairs: readonly Pair[] = PAIRS): (Pair & { ratio: number })[] {
  return pairs
    .map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
    .filter((p) => p.ratio < p.min);
}

function toRgb(value: string, over: string): { r: number; g: number; b: number } {
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value.trim());
  if (rgba) {
    const [r, g, b] = [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
    const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (a >= 1) return { r, g, b };
    const base = toRgb(over, '#000000');
    return { r: r * a + base.r * (1 - a), g: g * a + base.g * (1 - a), b: b * a + base.b * (1 - a) };
  }
  let h = value.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a colour: ${value}`);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
