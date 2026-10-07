// Says whether the window is wide enough for the tablet layout (side rail, two panes) and whether it is a phone.
/**
 * M22 US16 (T069, research R14). `wide` = the window is 768 pt or wider on a device that is not
 * a phone: the tab bar becomes a
 * side rail, list pages open details in a right pane, the player is a centred panel. Below that —
 * every phone, and an iPad in a narrow Split View — the phone layout is used unchanged.
 * `phone` = the screen's shortest side is under 600 pt: such a device is held in portrait
 * (app/_layout.tsx locks it at start-up); a tablet turns with the device.
 *
 * Read from `useWindowDimensions`, so a rotation or a Split View resize re-renders with the new
 * size in the same frame, and nothing is remounted (playback, scroll place and sheets are kept).
 */
import { useWindowDimensions } from 'react-native';

export const WIDE_MIN = 768;
export const PHONE_SHORT_SIDE = 600;

export type Layout = { wide: boolean; phone: boolean; width: number; height: number };

export function layoutFor(width: number, height: number): Layout {
  const phone = Math.min(width, height) < PHONE_SHORT_SIDE;
  // A phone never gets the tablet layout, even turned sideways (spec US16: "on a phone nothing changes").
  return { wide: width >= WIDE_MIN && !phone, phone, width, height };
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
