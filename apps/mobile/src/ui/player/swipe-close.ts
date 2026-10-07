// The player's swipe down: a downward drag on its top area closes the player.
/**
 * M21 US2 (FR-010). Research R7's fallback: the native stack's vertical gesture did not close the
 * player on the iPhone (walk 2026-10-07), so the top area carries its own pan. It claims a drag in
 * the capture phase once it moves at least 20 pt down and more down than sideways (taps on the
 * bar's buttons never move), and closes on release past 60 pt.
 */
import { useMemo } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';

/** At least 20 pt down, and more down than sideways. */
export function isSwipeDown(dx: number, dy: number): boolean {
  return dy > 20 && Math.abs(dy) > Math.abs(dx);
}

/** Far enough to close: 60 pt down. */
export function closesAt(dy: number): boolean {
  return dy > 60;
}

export function useSwipeDownToClose(close: () => void): GestureResponderHandlers {
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_e, g) => isSwipeDown(g.dx, g.dy),
    onMoveShouldSetPanResponder: (_e, g) => isSwipeDown(g.dx, g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_e, g) => { if (closesAt(g.dy)) close(); },
  }).panHandlers, [close]);
}
