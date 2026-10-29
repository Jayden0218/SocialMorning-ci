// How the root stack animates a page in: the Comments page rises from the bottom; Reduce Motion fades.
/**
 * M31 W3-D (design-pulse2 social.html `comments--screen`: the bottom zone starts with "close (44)",
 * not a back arrow, so Comments is a rise, like the player; the replies page has "back (44)" and
 * keeps the sideways push). Reduce Motion (design-pulse §System: "fades only") swaps the rise for a fade.
 */
export type StackAnimation = 'slide_from_bottom' | 'fade';

export function commentsAnimation(reduceMotion: boolean): StackAnimation {
  return reduceMotion ? 'fade' : 'slide_from_bottom';
}
