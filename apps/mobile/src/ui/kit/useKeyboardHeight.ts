// How tall the keyboard is while it is up (iOS only: Android resizes the window itself).
/**
 * 035 M4 (device check B2). The one keyboard hook: a pushed page lifts its title bar, and a foot composer lifts itself, by the
 * height iOS REPORTS (`endCoordinates.height`, from `keyboardWillShow`), never by a constant: the keyboard may be undocked on an
 * iPad, or show a predictive row. `keyboardWillHide` puts it back to 0. On Android the window shrinks for the keyboard, so 0.
 * M31 W4-B had this in `src/ui/status/` for the status reply box; it now lives here and that file re-exports it.
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

/** Pure: where a bar rides while the keyboard is up. `rest` is its distance from the page's foot at rest; the keyboard's top is `keyboard - strip` above that foot (the root layout pads the home strip), and the bar sits `gap` over it. */
export function liftedBottom(rest: number, keyboard: number, strip: number, gap: number): number {
  return keyboard > 0 ? Math.max(rest, keyboard - strip + gap) : rest;
}
