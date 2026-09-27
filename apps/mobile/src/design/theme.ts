/**
 * M10b dark mode — main's side of the switch (socialmorning-ba, 2026-09-27). On M9 this file
 * calls UniWind's `setTheme`, which flips the class variables and RN's colour scheme together.
 * On main there is no engine hook yet, so `applyAppearance` does nothing and `DARK_READY` pins
 * `useColours()` to light: a dark phone must not get dark icons and placeholders on light pages.
 * M9 replaces this file and sets DARK_READY true once the class side is wired.
 */
import type { Appearance } from '../ui/useColours';

export const DARK_READY = false;

export function applyAppearance(_appearance: Appearance): void {
  // No engine hook on main (see above).
}
