/**
 * The one place a colour, size, radius or padding is written down (M7 FR-002).
 * Change a colour here and every screen follows; `scripts/token-check.mjs` fails the
 * build if a colour literal appears anywhere else.
 *
 * **White theme (2026-09-27, the owner's call).** Replaces M7's black palette. Every
 * ratio below was measured with `contrast.ts` before adoption, and `PAIRS` re-checks
 * them on every run. Two things the flip forced:
 *   - the old accent #fc3c44 measures 3.58 on white and fails the 4.5 body floor, so the
 *     accent is the deeper #d70015 (5.38) — and white text on it measures the same 5.38;
 *   - text on a solid accent fill is `onAccent`, never `text`: dark text on red is 3.50.
 * Links AND destructive actions take the accent; a destructive action is told apart by
 * its word, never by its hue (FR-016).
 *
 * How the roles pair up:
 *   screen  → `background`, cards/sheets → `surface`
 *   words   → `text`, secondary words → `muted`, links/actions → `accent`
 *   a solid button → `bg-accent` + `text-onAccent`
 *   a chosen chip / toggle → `bg-selected border-accent` + `text-text`
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
  /** 5.38 on background, 4.94 on surface — links, primary actions, destructive actions, the listener's own marks. */
  accent: '#d70015',
  /** Text and icons on a solid accent fill. 5.38 on accent. */
  onAccent: '#ffffff',
  /** A chosen chip or toggle: a soft accent wash that `text` still reads on. */
  selected: '#fde8ea',
  /** Decorative: the scrubber's unfilled track. */
  track: 'rgba(0,0,0,0.12)',
  /** Carries information (the heat curve), so it must clear 3:1 — 0.50 black on white measures 3.98. */
  bar: 'rgba(0,0,0,0.50)',
  /** Decorative: the hairline between rows. */
  separator: 'rgba(0,0,0,0.12)',
  /** Decorative: behind a sheet. No text sits on it, so no contrast floor applies. */
  scrim: 'rgba(0,0,0,0.40)',
} as const;

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
