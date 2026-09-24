/**
 * The one place a colour, size, radius or padding is written down (M7 FR-002).
 *
 * The values are design decisions read from the reference app on 2026-09-24
 * (see `apps/mobile/LICENSES.md` — re-implemented, not copied), with two corrections
 * that measuring forced (research R1):
 *   - the heat bars are 40 % white, not the reference's 30 %: 30 % on black measures
 *     2.45 and fails the 3:1 floor for anything carrying information;
 *   - our old blue (#0645ad, 2.46) and dark red (#b00020, 2.87) are gone entirely —
 *     both are illegible on black. Links AND destructive actions take the accent, and a
 *     destructive action is told apart by its word, never by its hue (FR-016).
 *
 * `scripts/token-check.mjs` fails the build if a literal appears anywhere else.
 */
export const colour = {
  /** 21.00 against text. */
  background: '#000000',
  /** Cards, sheets, the mini player. */
  surface: '#101012',
  /** 21.00 on background. */
  text: '#ffffff',
  /** 8.27 on background — secondary lines. */
  muted: '#9ca3af',
  /** 5.87 on background — links, primary actions, destructive actions, the listener's own marks. */
  accent: '#fc3c44',
  /** Decorative: the scrubber's unfilled track. */
  track: 'rgba(255,255,255,0.18)',
  /** Carries information (the heat curve), so it must clear 3:1 — 0.40 measures 3.66. */
  bar: 'rgba(255,255,255,0.30)', // G2 BROKEN ON PURPOSE: the reference's value, 2.45
  /** Decorative: the hairline between rows. */
  separator: 'rgba(255,255,255,0.30)',
} as const;

export const fontSize = { xs: 12, sm: 16, base: 20, lg: 24 } as const;

export const spacing = { screenX: 24, row: 12, gap: 8, section: 16 } as const;

export const radius = { row: 8, artwork: 12, pill: 999 } as const;

/** M6 FR-015, carried forward: nothing a listener taps is smaller than this. */
export const hit = { min: 48 } as const;

export type Colour = keyof typeof colour;
