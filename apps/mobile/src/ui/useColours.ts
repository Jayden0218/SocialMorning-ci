/**
 * M10b US4 — the palette for code that needs a colour value rather than a class
 * (placeholderTextColor, an Icon's colour, a Switch track). It depends ONLY on the
 * Appearance setting and React Native's own `useColorScheme` — nothing from the styling
 * engine — so it survives M9's move to UniWind (socialmorning-ba, 2026-09-27). The class side
 * (every `bg-background`, `text-text` …) is wired by M9 from the same two objects.
 */
import { useColorScheme } from 'react-native';
import { colour, colourDark, type Palette } from '../design';
import type { SettingsStore } from '../storage/types';

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
  return paletteFor(readAppearance(settings), system === 'unspecified' ? null : system);
}
