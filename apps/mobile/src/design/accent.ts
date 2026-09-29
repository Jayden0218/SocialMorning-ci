/**
 * M12 FR-108: the chosen accent theme. Stored in settings (`pref.accent`), applied to the
 * classes through UniWind's own `updateCSSVariables` (uniwind 1.12, read in its native
 * config: it sets the variable per theme and re-renders what uses it), and to JS colour
 * readers through `useColours`, which listens here so an icon changes with the classes.
 */
import { Uniwind } from 'uniwind';
import { ACCENTS, type AccentName, type AccentKeys } from './tokens';

export const ACCENT_KEY = 'pref.accent';

export function readAccent(s: { get(key: string): string | undefined | null }): AccentName {
  const v = s.get(ACCENT_KEY);
  return v !== undefined && v !== null && v in ACCENTS ? (v as AccentName) : 'sunrise';
}

let current: AccentName = 'sunrise';
const listeners = new Set<() => void>();
export const accentStore = {
  get: (): AccentName => current,
  subscribe: (f: () => void): (() => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
};

const vars = (k: AccentKeys) => ({ '--color-primary': k.primary, '--color-onPrimary': k.onPrimary, '--color-accent': k.accent, '--color-accentTint': k.accentTint });

export function applyAccent(name: AccentName): void {
  current = name;
  const t = ACCENTS[name];
  try {
    Uniwind.updateCSSVariables('light', vars(t.light));
    Uniwind.updateCSSVariables('dark', vars(t.dark));
  } catch {
    // Test renderers have no UniWind runtime; the palette below still follows.
  }
  for (const f of listeners) f();
}

/** The palette with the accent's four tokens swapped in. */
export function withAccent<P extends AccentKeys>(palette: P, name: AccentName, dark: boolean): P {
  if (name === 'sunrise') return palette;
  const t = ACCENTS[name];
  return { ...palette, ...(dark ? t.dark : t.light) };
}
