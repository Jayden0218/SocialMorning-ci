// Player colours, with a light tint of the show's own colour at the top.
/**
 * The player's colours. Until M17 the player was always dark (owner, 2026-10-01); since M17
 * (constitution v3.0.0: light only, the B designs) it uses the light Editorial palette like
 * every other page (`Player-B`).
 *
 * The wash: when the show's creator set a theme colour in the Studio (`ShowExtras.overrides
 * .themeColour`), the top of the page is that colour, laid lightly over the page colour, at the
 * strongest strength where the text AND secondary text both still clear the body floor (4.5:1)
 * on it. A colour that cannot get there is refused, and the page stays plain.
 * Nothing is read from the artwork's pixels — that needs a native module (research R3).
 */
import { useSyncExternalStore } from 'react';
import { BODY_MIN, colour, contrastRatio, type Palette } from '@/design';
import { accentStore, withAccent } from '@/design/accent';

/** The palette with the listener's accent theme swapped in — what the player's icons use. */
export function usePlayerPalette(): Palette {
  const accent = useSyncExternalStore(accentStore.subscribe, accentStore.get, accentStore.get);
  return withAccent(colour, accent);
}

/** How much of the show's colour is kept, strongest first. */
const STRENGTHS = [0.4, 0.3, 0.2, 0.12] as const;

const HEX = /^#?([0-9a-fA-F]{6})$/;

function rgbOf(hex: string): [number, number, number] | undefined {
  const m = HEX.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: readonly number[]): string =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** `tint` laid over the page colour at `strength` (0–1). */
export function tintOverPage(tint: string, strength: number): string | undefined {
  const top = rgbOf(tint);
  const base = rgbOf(colour.background);
  if (!top || !base) return undefined;
  return toHex(top.map((v, i) => v * strength + base[i]! * (1 - strength)));
}

/** True when the palette's words read on `bg` at the body floor. */
export function readableOnPage(bg: string): boolean {
  return contrastRatio(colour.text, bg) >= BODY_MIN && contrastRatio(colour.muted, bg) >= BODY_MIN;
}

/**
 * The player's vertical wash, top → bottom, or undefined for the plain page.
 * The bottom two stops are the page colour, so the controls always sit on it.
 */
export function playerWash(themeColour: string | null | undefined): readonly [string, string, string] | undefined {
  if (!themeColour) return undefined;
  for (const s of STRENGTHS) {
    const top = tintOverPage(themeColour, s);
    if (top === undefined) return undefined;
    if (readableOnPage(top)) return [top, colour.background, colour.background];
  }
  return undefined;
}
