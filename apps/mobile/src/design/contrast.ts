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
 * Every foreground the app draws, against the background it is drawn on. M17 (research R2):
 * measured on the Editorial palette before adoption; the comment is the ratio on 2026-10-03.
 */
export const PAIRS: Pair[] = [
  { fg: colour.text, bg: colour.background, min: BODY_MIN, role: 'body text' }, // 17.47
  { fg: colour.muted, bg: colour.background, min: BODY_MIN, role: 'secondary text' }, // 6.96
  { fg: colour.accent, bg: colour.background, min: BODY_MIN, role: 'links and actions' }, // 5.59
  { fg: colour.text, bg: colour.surface, min: BODY_MIN, role: 'text on a card' }, // 18.53
  { fg: colour.muted, bg: colour.surface, min: BODY_MIN, role: 'secondary text on a card' }, // 7.39
  { fg: colour.accent, bg: colour.surface, min: BODY_MIN, role: 'links and actions on a card' }, // 5.93
  { fg: colour.onPrimary, bg: colour.primary, min: BODY_MIN, role: 'words on a yellow button or chosen chip' }, // 11.80
  { fg: colour.muted, bg: colour.primary, min: BODY_MIN, role: 'a second line on the yellow card' }, // 4.63
  { fg: colour.background, bg: colour.accent, min: BODY_MIN, role: 'a count badge (page words on the accent)' }, // 5.59
  { fg: colour.bar, bg: colour.background, min: LARGE_MIN, role: 'heat bars (information)' }, // 3.93
  { fg: colour.bar, bg: colour.surface, min: LARGE_MIN, role: 'heat bars on a card' },
  { fg: colour.accent, bg: over(colour.accentTint, colour.background), min: BODY_MIN, role: 'play glyph on its tint' }, // 4.60
  { fg: colour.muted, bg: over(colour.accentTint, colour.background), min: BODY_MIN, role: 'secondary text on the tint' }, // 5.74
  { fg: colour.playGlyph, bg: colour.playDisc, min: BODY_MIN, role: 'play triangle on its yellow disc' }, // 4.98
  { fg: colour.text, bg: over(colour.veil, '#000000'), min: BODY_MIN, role: 'player text on the veil (black cover)' }, // 13.29
  { fg: colour.muted, bg: over(colour.veil, '#000000'), min: BODY_MIN, role: 'player secondary text on the veil (black cover)' }, // 5.30
];

/**
 * M12 guard G-A1b (FR-108): every accent theme on the M17 page and card (light only since M17).
 * The brand theme ("sunrise") is left out: its pairs are the ones above.
 */
export const ACCENT_PAIRS: Pair[] = Object.entries(ACCENTS).filter(([name]) => name !== 'sunrise').flatMap(([name, t]) => [
  { fg: t.light.accent, bg: colour.background, min: BODY_MIN, role: `${name}: links on the page` },
  { fg: t.light.accent, bg: colour.surface, min: BODY_MIN, role: `${name}: links on a card` },
  { fg: t.light.onPrimary, bg: t.light.primary, min: BODY_MIN, role: `${name}: words on the fill` },
  { fg: t.light.accent, bg: over(t.light.accentTint, colour.background), min: LARGE_MIN, role: `${name}: play glyph on its tint` },
]);

/**
 * Pairs shipped below their floor, knowing the number. Empty since M17 (constitution v3.0.0:
 * "no contrast waiver"); guard G-E1 fails if anything is added back.
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
