// How tall the keyboard is while it is up (iOS only: Android resizes the window itself).
/**
 * M31 W4-B (design-pulse2 `status--reply-composer`: "the reply box rides up with the keyboard"). On iOS the page lifts its bottom bar by the
 * keyboard's height less the home strip (the root layout pads the strip already); on Android the window shrinks, so the bar needs no lift.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

/** Pure: the bar's distance from the page's foot — 6 at rest, or the keyboard's height less the strip plus 8 while it is up. */
export function barLift(keyboard: number, strip: number, rest: number, gap: number): number {
  return keyboard > 0 ? Math.max(rest, keyboard - strip + gap) : rest;
}
