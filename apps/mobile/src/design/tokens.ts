/**
 * The one place a colour, size, radius or padding is written down (M7 FR-002).
 * Change a colour here and every screen follows; `scripts/token-check.mjs` fails the
 * build if a colour literal appears anywhere else.
 *
 * **White theme, yellow brand (2026-09-27, the owner's call).** The yellow is taken
 * from the app icon (`assets/app-icon.png`, #fcc522). Every ratio below was measured
 * with `contrast.ts` before adoption, and `PAIRS` re-checks them on every run.
 * What measuring found:
 *   - the owner wants WHITE words on the icon's own yellow. That measures 1.60, under
 *     the 4.5 body floor. The owner chose it knowing the number (2026-09-27), so it is
 *     listed in `WAIVED` in `contrast.ts` — visible, not silently passing;
 *   - links, text actions and the listener's own marks need a colour that reads on
 *     white, so `accent` is a deep amber from the same family (5.93).
 * A destructive action is told apart by its word, never by its hue (FR-016).
 *
 * How the roles pair up:
 *   screen  → `background`, cards/sheets → `surface`
 *   words   → `text`, secondary words → `muted`, links/text actions → `accent`
 *   a solid button, a chosen chip → `bg-primary` + `text-onPrimary`
 */
export const colour = {
  /** 18.85 against text. */
  background: '#ffffff',
  /** Cards, sheets, the mini player. 17.31 against text. */
  surface: '#f5f5f7',
  /** 18.85 on background. */
  text: '#111114',
  /** 6.05 on background, 5.56 on surface — secondary lines. */
  muted: '#5f6368',
  /** The brand yellow, from the app icon. A fill only: 1.60 on white, so never text. */
  primary: '#fcc522',
  /** Words and icons on a `primary` fill. 1.60 on primary — the owner's waiver. */
  onPrimary: '#ffffff',
  /** 5.93 on background, 5.44 on surface — links, text actions, the listener's own marks. */
  accent: '#8a5a00',
  /** Decorative: the scrubber's unfilled track. */
  track: 'rgba(0,0,0,0.12)',
  /** Carries information (the heat curve), so it must clear 3:1 — 0.50 black on white measures 3.98. */
  bar: 'rgba(0,0,0,0.50)',
  /** Decorative: the hairline between rows. */
  separator: 'rgba(0,0,0,0.12)',
  /** Decorative: behind a sheet. No text sits on it, so no contrast floor applies. */
  scrim: 'rgba(0,0,0,0.40)',
  /**
   * Facebook's brand blue, only for its own mark on "Continue with Facebook" (owner,
   * 2026-09-27). #1877F2 per the brand-colour references; never used as a UI colour.
   */
  facebook: '#1877f2',
  /** Decorative: the page colour at 0 % — where a fade into the page starts. */
  clear: 'rgba(255,255,255,0)',
} as const;

/**
 * The dark palette (M10b US4, owner 2026-09-27: "Appearance: System / Light / Dark").
 * Exactly the same keys as `colour`, plain string literals only — M9's generator reads both
 * objects and writes CSS variables from them (socialmorning-ba, 2026-09-27). Measured with
 * `contrast.ts` before adoption, and re-checked on every run by `PAIRS_DARK`:
 * text 16.87 · muted 7.62 · accent 11.80 on background; text 15.02 · muted 6.79 · accent
 * 10.51 on surface; bar 6.21 / 5.93. The brand yellow is bright enough to be the link colour
 * on dark. White on the yellow fill stays the owner's waiver (1.60), as in light.
 */
export const colourDark = {
  background: '#111114',
  surface: '#1d1d22',
  text: '#f2f2f5',
  muted: '#a1a5ac',
  primary: '#fcc522',
  onPrimary: '#ffffff',
  accent: '#fcc522',
  track: 'rgba(255,255,255,0.16)',
  bar: 'rgba(255,255,255,0.55)',
  separator: 'rgba(255,255,255,0.14)',
  scrim: 'rgba(0,0,0,0.60)',
  /** The Facebook sign-in button's own blue — a brand colour, the same in both palettes. */
  facebook: '#1877f2',
  /** The page colour at 0 % — where a fade into the dark page starts. */
  clear: 'rgba(17,17,20,0)',
} as const;

export type Palette = { readonly [K in keyof typeof colour]: string };

export const fontSize = { xs: 12, sm: 16, base: 20, lg: 24 } as const;

export const spacing = { screenX: 24, row: 12, gap: 8, section: 16 } as const;

export const radius = { row: 8, artwork: 12, pill: 999 } as const;

/** M6 FR-015, carried forward: nothing a listener taps is smaller than this. */
export const hit = { min: 48 } as const;

/**
 * Fixed-width digits, so a ticking time does not jitter. The one style Tailwind cannot
 * express here: `tabular-nums` compiles to nothing on native (NativeWind drops
 * `font-variant-numeric`), and token-check rejects the class for that reason.
 */
export const tabular = { fontVariant: ['tabular-nums'] } as { fontVariant: ['tabular-nums'] };

export type Colour = keyof typeof colour;
