// Tells the now bar that the Moments feed is the screen in front, so it hides (design-pulse2 §Bars).
/**
 * M31 integration (lane L5): the drawings hide the now bar on Home's Moments view (the feed has its
 * own Play circle). Home knows (`useMomentsOnScreen`: Moments chosen AND Home focused); the bar listens
 * to `nowbar-signals`. This joins the two and is called once, from `app/(tabs)/index.tsx`.
 * The signal is lowered when Home loses focus, switches to Discover, or unmounts.
 */
import { useMomentsOnScreen } from '@/ui/discover/homeView';
import { useNowBarSignal } from '@/ui/player/nowbar-signals';

export function useMomentsNowBar(): boolean {
  const on = useMomentsOnScreen();
  useNowBarSignal('moments', on);
  return on;
}
