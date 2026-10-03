// Gives the app's colour values to code that needs a colour, not a class.
/**
 * The palette for code that needs a colour value rather than a class (placeholderTextColor,
 * an Icon's colour, a Switch track). Since M17 (constitution v3.0.0) the app is light only:
 * this is the Editorial palette with the listener's accent theme swapped in. The class side
 * (every `bg-background`, `text-text` …) is generated from the same object into `global.css`.
 */
import { useSyncExternalStore } from 'react';
import { colour, type Palette } from '@/design';
import { accentStore, withAccent } from '@/design/accent';
import type { SettingsStore } from '@/storage/types';

/**
 * `settings` is kept so every caller stays as it is; nothing is read from it since M17 —
 * `pref.appearance` (the old System / Light / Dark choice) is ignored (FR-011).
 */
export function useColours(_settings?: Pick<SettingsStore, 'get'>): Palette {
  // M12 FR-108: the accent theme swaps four tokens; listening here re-renders on a change.
  const accent = useSyncExternalStore(accentStore.subscribe, accentStore.get, accentStore.get);
  return withAccent(colour, accent);
}
