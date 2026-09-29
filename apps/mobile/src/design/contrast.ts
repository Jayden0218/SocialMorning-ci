/**
 * WCAG 2.x relative luminance and contrast ratio, so FR-014 is asserted rather than
 * assumed. The same formula was used to compute the palette in research R1; shipping it
 * means the gate re-checks every token pair on every run.
 */
import { colour, colourDark } from './tokens';

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

/** Every foreground the app draws, against the background it is drawn on. */
export const PAIRS: Pair[] = [
  { fg: colour.text, bg: colour.background, min: BODY_MIN, role: 'body text' },
  { fg: colour.muted, bg: colour.background, min: BODY_MIN, role: 'secondary text' },
  { fg: colour.accent, bg: colour.background, min: BODY_MIN, role: 'links and actions' },
  { fg: colour.text, bg: colour.surface, min: BODY_MIN, role: 'text on a card' },
  { fg: colour.muted, bg: colour.surface, min: BODY_MIN, role: 'secondary text on a card' },
  { fg: colour.bar, bg: colour.background, min: LARGE_MIN, role: 'heat bars (information)' },
  { fg: colour.accent, bg: colour.background, min: LARGE_MIN, role: 'the listener’s own marks' },
  { fg: colour.accent, bg: colour.surface, min: BODY_MIN, role: 'links and actions on a card' },
  { fg: colour.bar, bg: colour.surface, min: LARGE_MIN, role: 'heat bars on a card' },
  // M12: a list row's play glyph on its tinted disc; the player's words on the veil over a white cover.
  { fg: colour.accent, bg: over(colour.accentTint, colour.background), min: LARGE_MIN, role: 'play glyph on its tint' },
  { fg: colourDark.text, bg: over(colour.scrimStrong, '#ffffff'), min: BODY_MIN, role: 'player text on the veil (white cover)' },
];

/** M10b US4: the same pairs in the dark palette — every one must clear its floor too. */
export const PAIRS_DARK: Pair[] = [
  { fg: colourDark.text, bg: colourDark.background, min: BODY_MIN, role: 'body text (dark)' },
  { fg: colourDark.muted, bg: colourDark.background, min: BODY_MIN, role: 'secondary text (dark)' },
  { fg: colourDark.accent, bg: colourDark.background, min: BODY_MIN, role: 'links and actions (dark)' },
  { fg: colourDark.text, bg: colourDark.surface, min: BODY_MIN, role: 'text on a card (dark)' },
  { fg: colourDark.muted, bg: colourDark.surface, min: BODY_MIN, role: 'secondary text on a card (dark)' },
  { fg: colourDark.bar, bg: colourDark.background, min: LARGE_MIN, role: 'heat bars (dark)' },
  { fg: colourDark.accent, bg: colourDark.surface, min: BODY_MIN, role: 'links and actions on a card (dark)' },
  { fg: colourDark.bar, bg: colourDark.surface, min: LARGE_MIN, role: 'heat bars on a card (dark)' },
  { fg: colourDark.accent, bg: over(colourDark.accentTint, colourDark.background), min: LARGE_MIN, role: 'play glyph on its tint (dark)' },
  { fg: colourDark.text, bg: over(colourDark.scrimStrong, '#ffffff'), min: BODY_MIN, role: 'player text on the veil, white cover (dark)' },
];

/**
 * Pairs the owner chose to ship below their floor, knowing the number. They are not in
 * `PAIRS`, so the gate stays green; the contrast test pins each one's ratio, so a
 * waiver cannot quietly get worse or be forgotten.
 */
export const WAIVED: (Pair & { why: string })[] = [
  {
    fg: colour.onPrimary, bg: colour.primary, min: BODY_MIN, role: 'white text on a yellow button or chosen chip',
    why: 'owner, 2026-09-27: white words on the icon yellow, chosen over black (11.80) and gold #9a6c00 (4.65)',
  },
];

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
