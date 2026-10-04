// Lists every colour, font size, spacing and corner size the app uses.
/**
 * The one place a colour, size, radius or padding is written down (M7 FR-002).
 * Change a colour here and every screen follows; `scripts/token-check.mjs` fails the
 * build if a colour literal appears anywhere else.
 *
 * **Editorial, light only (M17, constitution v3.0.0, owner 2026-10-03).** The phone app follows
 * the B "Editorial" designs (specs/018-m17-editorial/designs): a warm paper page, white cards
 * with a thin border, the icon's yellow (#fcc522) as a fill. Dark mode is gone. Every ratio below
 * was measured with `contrast.ts` before adoption (research R2) and `PAIRS` re-checks them on
 * every run. The white-on-yellow waiver (1.60, 2026-09-27) ended with v3.0.0: words on the fill
 * are now the dark `onPrimary` (11.80).
 * A destructive action is told apart by its word, never by its hue (FR-016).
 *
 * How the roles pair up:
 *   screen  → `background`, cards/sheets → `surface` + a `border`
 *   words   → `text`, secondary words → `muted`, links/text actions → `accent`
 *   a solid button, a chosen chip → `bg-primary` + `text-onPrimary`
 */
export const colour = {
  /** The warm paper page (owner, 2026-10-04: #fbf8f1, measured from the owner's picture). 17.47 against text. */
  background: '#fbf8f1',
  /** Cards, sheets, the mini player, the tab bar. 18.53 against text. */
  surface: '#ffffff',
  /** Decorative: the 1 px border round a card, chip or tile (1.18 — no text sits on it). */
  border: 'rgba(17,17,20,0.08)',
  /** 17.47 on background. */
  text: '#16130d',
  /** 6.96 on background, 7.39 on surface — secondary lines. */
  muted: '#5c5546',
  /** The brand yellow, from the app icon. A fill only: never words on the page. */
  primary: '#fcc522',
  /** Words and icons on a `primary` fill: 11.80 (muted on the fill 4.63). */
  onPrimary: '#111114',
  /** 5.59 on background, 5.93 on surface — links, text actions, the listener's own marks. */
  accent: '#8a5a00',
  /** Decorative: the scrubber's unfilled track. */
  track: 'rgba(17,17,20,0.10)',
  /** Carries information (the heat curve), so it must clear 3:1 — 3.93 on the page. */
  bar: 'rgba(0,0,0,0.50)',
  /** Decorative: the hairline between rows. */
  separator: 'rgba(17,17,20,0.08)',
  /** Decorative: behind a sheet. No text sits on it, so no contrast floor applies. */
  scrim: 'rgba(0,0,0,0.40)',
  /**
   * Facebook's brand blue, only for its own mark on "Continue with Facebook" (owner,
   * 2026-09-27). #1877F2 per the brand-colour references; never used as a UI colour.
   */
  facebook: '#1877f2',
  /** Decorative: the page colour at 0 % — where a fade into the page starts. */
  clear: 'rgba(251,248,241,0)',
  /** M12 FR-053: the disc behind a list row's play glyph — the accent at 14 % (glyph on it 4.60). */
  accentTint: 'rgba(138,90,0,0.14)',
  /** The veil over the player's blurred artwork — the page at 88 % (over black: text 13.29, muted 5.30). */
  veil: 'rgba(251,248,241,0.88)',
} as const;

export type Palette = { readonly [K in keyof typeof colour]: string };

/**
 * M12 FR-108: accent themes — SocialNet's own, not 小宇宙's (FR-110). Each swaps only the four
 * accent tokens. Measured with `contrast.ts` before adoption (2026-09-29), re-measured on the M17
 * page (2026-10-03) and re-checked on every run by `ACCENT_PAIRS` (guard G-A1b): accent on page /
 * card, words on the fill, the play glyph on its tint. Lowest: forest's accent on the page, 4.73;
 * forest's glyph on its tint, 3.93 (floor 3). Light only since M17. "sunrise" is the brand palette.
 */
export type AccentKeys = { primary: string; onPrimary: string; accent: string; accentTint: string };
export const ACCENTS = {
  sunrise: { label: 'Sunrise', light: { primary: colour.primary, onPrimary: colour.onPrimary, accent: colour.accent, accentTint: colour.accentTint } },
  teal: { label: 'Teal', light: { primary: '#0f766e', onPrimary: '#ffffff', accent: '#0f766e', accentTint: 'rgba(15,118,110,0.14)' } },
  coral: { label: 'Coral', light: { primary: '#be123c', onPrimary: '#ffffff', accent: '#be123c', accentTint: 'rgba(190,18,60,0.14)' } },
  violet: { label: 'Violet', light: { primary: '#6d28d9', onPrimary: '#ffffff', accent: '#6d28d9', accentTint: 'rgba(109,40,217,0.14)' } },
  forest: { label: 'Forest', light: { primary: '#15803d', onPrimary: '#ffffff', accent: '#15803d', accentTint: 'rgba(21,128,61,0.14)' } },
  ocean: { label: 'Ocean', light: { primary: '#1d4ed8', onPrimary: '#ffffff', accent: '#1d4ed8', accentTint: 'rgba(29,78,216,0.14)' } },
  plum: { label: 'Plum', light: { primary: '#a21caf', onPrimary: '#ffffff', accent: '#a21caf', accentTint: 'rgba(162,28,175,0.14)' } },
} as const satisfies Record<string, { label: string; light: AccentKeys }>;
export type AccentName = keyof typeof ACCENTS;

/**
 * M7's four steps (xs 12, sm 16, base 20, lg 24) plus M17's Editorial steps (data-model §2):
 * micro 11 (eyebrows), meta 13 (times, counts), body 14 (rows, body text), title 17 (episode and
 * show titles in cards), hero 28 and display 32 (serif page titles). Classes: `text-<name>`.
 */
export const fontSize = { micro: 11, xs: 12, meta: 13, body: 14, sm: 16, title: 17, base: 20, lg: 24, hero: 28, display: 32 } as const;

/**
 * M12 (FR-051, FR-052): one 20 pt side margin on every page (was 24, and several pages used
 * 12 of their own); sections 16 apart.
 */
export const spacing = { screenX: 20, row: 12, gap: 8, section: 16 } as const;

/** M12 FR-050: a list row is 50 pt tall at the default text size, and grows with it. */
export const size = { row: 50 } as const;

/** M17: the Editorial shapes — cards and rows in cards 16, artwork 16 (22 at 96 pt and up). */
export const radius = { row: 16, artwork: 16, artworkLarge: 22, pill: 999 } as const;

/** M6 FR-015, carried forward: nothing a listener taps is smaller than this. */
export const hit = { min: 48 } as const;

/**
 * Fixed-width digits, so a ticking time does not jitter. The one style Tailwind cannot
 * express here: `tabular-nums` compiles to nothing on native (NativeWind drops
 * `font-variant-numeric`), and token-check rejects the class for that reason.
 */
export const tabular = { fontVariant: ['tabular-nums'] } as { fontVariant: ['tabular-nums'] };

export type Colour = keyof typeof colour;
