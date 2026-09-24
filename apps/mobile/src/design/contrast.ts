/**
 * WCAG 2.x relative luminance and contrast ratio, so FR-014 is asserted rather than
 * assumed. The same formula was used to compute the palette in research R1; shipping it
 * means the gate re-checks every token pair on every run.
 */
import { colour } from './tokens';

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
