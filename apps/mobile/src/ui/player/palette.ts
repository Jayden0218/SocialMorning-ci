/**
 * The player is always dark (Owner, 2026-10-01, after the 小宇宙 player): its page takes the
 * dark palette whatever the app's own Appearance is. The classes follow through UniWind's
 * `<ScopedTheme theme="dark">` (uniwind 1.12.0 ships it); this file gives the JS side —
 * icon colours, the wash — the same dark values.
 *
 * The wash: when the show's creator set a theme colour in the Studio (`ShowExtras.overrides
 * .themeColour`), the top of the page is that colour, darkened toward the dark background
 * until the dark palette's text AND secondary text both clear the body floor (4.5:1) on it.
 * A colour that cannot get there is refused, and the page stays on the dark background.
 * Nothing is read from the artwork's pixels — that needs a native module (research R3).
 */
import { createContext, useSyncExternalStore } from 'react';
import { BODY_MIN, colourDark, contrastRatio, type Palette } from '../../design';
import { accentStore, withAccent } from '../../design/accent';

/** The dark palette with the listener's accent theme swapped in — what the player's icons use. */
export function usePlayerPalette(): Palette {
  const accent = useSyncExternalStore(accentStore.subscribe, accentStore.get, accentStore.get);
  return withAccent(colourDark, accent, true);
}

/**
 * Set by the player around its own subtree. `useColours` (src/ui/useColours.ts) should
 * return this when it is set, so HeatCurve and Scrubber — which read the app palette — draw
 * dark-palette bars on the dark player. Undefined everywhere else.
 */
export const ForcedPalette = createContext<Palette | undefined>(undefined);

/** How much of the show's colour is kept, strongest first. */
const STRENGTHS = [0.6, 0.5, 0.4, 0.3, 0.2] as const;

const HEX = /^#?([0-9a-fA-F]{6})$/;

function rgbOf(hex: string): [number, number, number] | undefined {
  const m = HEX.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: readonly number[]): string =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** `tint` laid over the dark background at `strength` (0–1). */
export function darken(tint: string, strength: number): string | undefined {
  const top = rgbOf(tint);
  const base = rgbOf(colourDark.background);
  if (!top || !base) return undefined;
  return toHex(top.map((v, i) => v * strength + base[i]! * (1 - strength)));
}

/** True when the dark palette's words read on `bg` at the body floor. */
export function readableOnDark(bg: string): boolean {
  return contrastRatio(colourDark.text, bg) >= BODY_MIN && contrastRatio(colourDark.muted, bg) >= BODY_MIN;
}

/**
 * The player's vertical wash, top → bottom, or undefined for the plain dark page.
 * The bottom two stops are the dark background, so the controls always sit on it.
 */
export function playerWash(themeColour: string | null | undefined): readonly [string, string, string] | undefined {
  if (!themeColour) return undefined;
  for (const s of STRENGTHS) {
    const top = darken(themeColour, s);
    if (top === undefined) return undefined;
    if (readableOnDark(top)) return [top, colourDark.background, colourDark.background];
  }
  return undefined;
}
