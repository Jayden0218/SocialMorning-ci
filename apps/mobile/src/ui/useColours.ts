/**
 * M10b US4 — the palette for code that needs a colour value rather than a class
 * (placeholderTextColor, an Icon's colour, a Switch track). It depends ONLY on the
 * Appearance setting and React Native's own `useColorScheme` — nothing from the styling
 * engine — so it survives M9's move to UniWind (socialmorning-ba, 2026-09-27). The class side
 * (every `bg-background`, `text-text` …) is wired by M9 from the same two objects.
 */
import { useContext, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';
import { colour, colourDark, type Palette } from '../design';
import { DARK_READY } from '../design/theme';
import { accentStore, withAccent } from '../design/accent';
import type { SettingsStore } from '../storage/types';
import { ForcedPalette } from './player/palette';

export type Appearance = 'system' | 'light' | 'dark';
export const APPEARANCE_KEY = 'pref.appearance';

export function readAppearance(s: Pick<SettingsStore, 'get'>): Appearance {
  const v = s.get(APPEARANCE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** Which palette: the setting wins; "system" follows the phone. */
export function paletteFor(appearance: Appearance, system: 'light' | 'dark' | null | undefined): Palette {
  const dark = appearance === 'dark' || (appearance === 'system' && system === 'dark');
  return dark ? colourDark : colour;
}

export function useColours(settings: Pick<SettingsStore, 'get'>): Palette {
  const system = useColorScheme();
  // M12 FR-108: the accent theme swaps four tokens; listening here re-renders on a change.
  const accent = useSyncExternalStore(accentStore.subscribe, accentStore.get, accentStore.get);
  // Owner, 2026-10-01: the player is always dark; inside it every reader (heat curve,
  // scrubber) gets the dark palette whatever the app theme. Read before any return (hook order).
  const forced = useContext(ForcedPalette);
  if (forced) return forced;
  // Until the class side flips too (M9), every JS reader stays on the light palette.
  if (!DARK_READY) return withAccent(colour, accent, false);
  const p = paletteFor(readAppearance(settings), system === 'dark' || system === 'light' ? system : null);
  return withAccent(p, accent, p === colourDark);
}
