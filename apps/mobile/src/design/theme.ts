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
import { Appearance as RNAppearance } from 'react-native';
import { Uniwind } from 'uniwind';
import type { Appearance } from '../ui/useColours';

export const DARK_READY = true;

export function applyAppearance(appearance: Appearance): void {
  try {
    const theme = DARK_READY ? appearance : 'light';
    // Phone walk 2026-09-30: Dark → "Follow the phone" stayed dark until a restart. UniWind
    // 1.12's setTheme('system') reads the colour scheme BEFORE it removes its own 'dark'
    // override, so it reads 'dark' back. Clearing the override first ('auto' in RN 0.88's
    // Appearance) makes it read the phone's real scheme; the second call covers a phone that
    // reports the new scheme a moment late.
    if (theme === 'system') {
      RNAppearance.setColorScheme('auto');
      Uniwind.setTheme('system');
      setTimeout(() => { try { Uniwind.setTheme('system'); } catch { /* as below */ } }, 300);
      return;
    }
    Uniwind.setTheme(theme);
  } catch {
    // Test renderers have no native Appearance module; the light variables are the default.
  }
}
