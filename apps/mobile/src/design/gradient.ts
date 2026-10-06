// Picks page and player tints, refusing any that make text hard to read.
/**
 * The player's background wash (M7 T013).
 *
 * **What is actually wired today**: a neutral vertical wash, `surface` → `background`.
 * React Native cannot read an image's pixels without a native module, and research R3
 * kept `react-native-image-colors` — the reference's extractor — out of the default path:
 * it is a third-party native dependency on a preview SDK, on the one build path this
 * project has, for a nicety. Adding it becomes its own decision with its own device row
 * if the neutral wash proves too plain at K1.
 *
 * **What this function is for**: whatever the source of a tint ever is, it passes through
 * here, and here it is measured. A tint that would drop white text under the body floor
 * is refused and the flat background is used instead (FR-014, research R3/R4). That rule
 * is the reason this is a module with a test rather than three lines inside the screen.
 */
import { ACCENTS, colour } from './tokens';
import { BODY_MIN, contrastRatio } from './contrast';

/** Top, middle, bottom. `expo-linear-gradient` wants at least two. */
export type Gradient = readonly [string, string, string];

/** The wash used when there is no tint, or when a tint would hurt legibility. */
export const FLAT: Gradient = [colour.surface, colour.background, colour.background];

export function gradientFor(tint?: string | null): Gradient {
  if (!tint) return FLAT;
  // The top of the gradient is the only band text sits on with any strength, so it is
  // the one that has to clear the floor.
  if (contrastRatio(colour.text, tint) < BODY_MIN) return FLAT;
  return [tint, colour.background, colour.background];
}

/**
 * M21 US4/US5 (research R6, guard G-M21-5): the episode and show pages' cover tint. The server
 * sends the cover's average colour (`tint`, worked out there — still no native module); here it
 * is laid over the paper page at the strongest of these mixes where the body text, the
 * secondary text, the brand accent and every accent passed in all stay at 4.5:1 or more on it.
 * None passes → plain paper.
 *
 * `accents` defaults to every accent theme (`ACCENTS`), the strict reading of R6: the tint is
 * then safe whichever theme is on. A screen passes the listener's own accent
 * (`useColours().accent`) — the only one it draws — so a navy or red cover can still show a
 * light tint; the page re-renders, and re-measures, when the theme changes.
 */
export const TINT_MIXES = [0.3, 0.2, 0.12, 0.08] as const;

/** Every accent theme's accent, the brand one included. */
export const ALL_ACCENTS: readonly string[] = [...new Set(Object.values(ACCENTS).map((a) => a.light.accent as string))];

function rgbOf(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `hex` laid over the paper page at `strength` (0–1), as a six-digit hex; undefined if `hex` is not one. */
export function mixOverPage(hex: string, strength: number): string | undefined {
  const top = rgbOf(hex);
  const base = rgbOf(colour.background);
  if (!top || !base) return undefined;
  return `#${top.map((v, i) => Math.round(v * strength + base[i]! * (1 - strength)).toString(16).padStart(2, '0')).join('')}`;
}

/** True when text, muted, the brand accent and each of `accents` read at the body floor on `bg`. */
export function wordsReadOn(bg: string, accents: readonly string[] = ALL_ACCENTS): boolean {
  return [colour.text, colour.muted, colour.accent, ...accents].every((fg) => contrastRatio(fg, bg) >= BODY_MIN);
}

/** The page colour for a cover tint: the strongest readable mix, or the paper page. */
export function tintFor(hex: string | null | undefined, accents: readonly string[] = ALL_ACCENTS): string {
  if (!hex) return colour.background;
  for (const m of TINT_MIXES) {
    const bg = mixOverPage(hex, m);
    if (bg === undefined) return colour.background;
    return bg; // RED CHECK G-M21-5
  }
  return colour.background;
}
