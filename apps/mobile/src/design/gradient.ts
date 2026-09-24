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
import { colour } from './tokens';
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
