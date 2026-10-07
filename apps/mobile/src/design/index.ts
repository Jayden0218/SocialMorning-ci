// Gathers the design exports so screens import them from one place.
/** The design system in one import: colours, sizes, contrast checks and gradients. */
export { colour, fontSize, spacing, radius, coverRadius, hit, size, tabular, ACCENTS, type AccentName } from './tokens';
export type { Palette } from './tokens';
export type { Colour } from './tokens';
export { relativeLuminance, contrastRatio, failures, BODY_MIN, LARGE_MIN, PAIRS, WAIVED, ACCENT_PAIRS } from './contrast';
export type { Pair } from './contrast';
export { gradientFor, FLAT, type Gradient, tintFor, wordsReadOn, mixOverPage, TINT_MIXES, ALL_ACCENTS } from './gradient';
