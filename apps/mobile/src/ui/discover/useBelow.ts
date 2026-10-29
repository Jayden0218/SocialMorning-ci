// What is under the Moments page on the phone: the tab bar and the home-bar strip.
/**
 * The Moments card's scrim is the drawing's gradient over the PHONE's height (the page plus the bars under it), so a card
 * needs to know how tall those bars are: the tab bar (58) plus the safe-area strip. This READS the inset to place a gradient;
 * it pads nothing, so it is not the double inset guard G-BB1 (`__tests__/bottom-bar.test.ts`) exists to stop — which is why it
 * lives in a `.ts` hook, beside `src/ui/player/measures.ts` (the player's own use of the inset), and not in the `.tsx` page.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bars } from '@/design';

export function useBelow(): number {
  return bars.tab + useSafeAreaInsets().bottom;
}
