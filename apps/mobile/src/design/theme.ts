/**
 * M10b dark mode, the class side (M9 + socialmorning-4f, 2026-09-27). `global.css` carries a
 * light and a dark set of the token variables (scripts/tokens-to-css.mjs); UniWind picks one.
 * `Uniwind.setTheme` also sets React Native's own colour scheme, so `useColours()` — the
 * palette for code that needs a value, not a class — always agrees with the classes.
 *
 * DARK_READY turned true on 2026-09-27, once every JS colour reader went through
 * `useColours()` (4f, main 0b5caf9) and the last two value reads (Icon's play/pause, the
 * status bar) followed the theme. Set it false again to pin the whole app to light.
 */
import { Uniwind } from 'uniwind';
import type { Appearance } from '../ui/useColours';

export const DARK_READY = true;

export function applyAppearance(appearance: Appearance): void {
  try {
    Uniwind.setTheme(DARK_READY ? appearance : 'light');
  } catch {
    // Test renderers have no native Appearance module; the light variables are the default.
  }
}
