// Saves the chosen accent colour and applies it across the whole app.
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

// M31: the Pulse `hot` / `hotText` / `hotSoft` follow the accent, so a redrawn screen takes the colour too.
const vars = (k: AccentKeys) => ({
  '--color-primary': k.primary, '--color-onPrimary': k.onPrimary, '--color-accent': k.accent, '--color-accentTint': k.accentTint,
  '--color-hot': k.primary, '--color-hotText': k.accent, '--color-hotSoft': k.accentTint,
});

export function applyAccent(name: AccentName): void {
  current = name;
  const t = ACCENTS[name];
  try {
    // M31: dark only. UniWind builds a `light` and a `dark` theme and they must carry the same
    // variables (scripts/tokens-to-css.mjs writes both as the Pulse palette) — keep them so.
    Uniwind.updateCSSVariables('light', vars(t.light));
    Uniwind.updateCSSVariables('dark', vars(t.light));
  } catch {
    // Test renderers have no UniWind runtime; the palette below still follows.
  }
  for (const f of listeners) f();
}

/** The palette with the accent's four tokens swapped in — and the Pulse `hot`, `hotText`, `hotSoft` that follow them. */
export function withAccent<P extends AccentKeys>(palette: P, name: AccentName): P {
  if (name === 'sunrise') return palette;
  const a = ACCENTS[name].light;
  return { ...palette, ...a, hot: a.primary, hotText: a.accent, hotSoft: a.accentTint };
}
