// Lists every colour, font size, spacing and corner size the app uses.
/**
 * The one place a colour, size, radius or padding is written down (M7 FR-002).
 * Change a colour here and every screen follows; `scripts/token-check.mjs` fails the
 * build if a colour literal appears anywhere else.
 *
 * **Pulse, dark only (M31 T021, constitution v4.0.0, owner 2026-10-27).** The phone app follows
 * the Pulse drawings (`specs/033-m31-redesign/design-pulse2/`, `kit.css` + `index.html`): a
 * near-black page (`void`), two raised surfaces, the hot (#FF4D6D) to violet pulse. There is one
 * theme. Every pair was measured with `contrast.ts` before adoption and `PAIRS` re-checks them on
 * every run. Words on `hot` are `void` — white on hot fails (3.21, the drawing says "3.0").
 *
 * Two groups of names live side by side while the screens are redrawn wave by wave:
 *   - the Pulse names (`void`, `raise`, `raise2`, `line`, `text2`, `text3`, `idle`, `hot`,
 *     `hotText`, `violet`, `ok`, `warn` …) — what a redrawn screen uses;
 *   - the older role names (`background`, `surface`, `muted`, `primary`, `accent` …) — kept so a
 *     screen not yet redrawn keeps compiling and now reads the Pulse values. They are aliases and
 *     go when the last wave is done.
 *
 * How the roles pair up:
 *   screen  → `void`, cards → `raise` (+ `line`), sheets/inputs/now bar → `raise2`
 *   words   → `text`, secondary → `text2`, captions → `text3`, hot words/links → `hotText`
 *   a solid button, a chosen chip → `hot` (or `text`) + `void` words
 */
export const colour = {
  // ---- Pulse (kit.css :root) ---------------------------------------------------------------
  /** The page. Near-black with a cold tint. */
  void: '#060608',
  /** Cards, the field behind rows on press. */
  raise: '#111116',
  /** Sheets, inputs, the now bar, dialogs. */
  raise2: '#1a1a21',
  /** Hairlines, 1 px. Decorative (1.31 on the page — no words sit on it). */
  line: '#24242c',
  /** Titles, body, active icons. 18.11 on void. */
  text: '#f4f2ee',
  /** Secondary words. 7.95 on void, 6.79 on raise2. */
  text2: '#a3a1ab',
  /** Captions, timestamps in lists. 5.81 on void, 4.96 on raise2. */
  text3: '#8a8893',
  /** Idle tab icons — graphic only, never words (4.51, floor 3). */
  idle: '#77767e',
  /** The pulse: played bars, hot tags, badges, the active-tab dot. Words on it are `void` (6.30). */
  hot: '#ff4d6d',
  /** Hot words on dark: links, timestamps. 8.46 on void, 7.23 on raise2. */
  hotText: '#ff8095',
  /** The second glow colour, the end of the gradients. Never for words (3.78 on void as a graphic). */
  violet: '#7a3cff',
  /** Success. 11.46 on void. */
  ok: '#3ddc97',
  /** Warning. 11.52 on void. */
  warn: '#ffb547',

  // ---- Pulse parts built from the drawings ---------------------------------------------------
  /**
   * The heat curve's unplayed bars, the ring's unplayed spokes and the scrubber track. The
   * drawings use white at 18–28 %, which is 1.6–2.4 on void — under the 3:1 floor for something
   * that carries information (where people reacted). 40 % is 3.73. A deviation from the drawing.
   */
  barIdle: 'rgba(255,255,255,0.40)',
  /** The now bar's glass (raise2 at 86 %, behind a blur). Text on it over void: 15.95. */
  glass: 'rgba(26,26,33,0.86)',
  /** Glass over a picture: the Moments sound pill, the Skip pill, the switch capsule. */
  glassDark: 'rgba(6,6,8,0.55)',
  /** The 1 px line round a glass bar (8 % white). Decorative. */
  glassLine: 'rgba(255,255,255,0.08)',
  /** The 1 px line on top of the tab bar (6 % white). Decorative. */
  barLine: 'rgba(255,255,255,0.06)',
  /** The grabber on a sheet (20 % white). Decorative. */
  grab: 'rgba(255,255,255,0.20)',
  /** A ring button's outline (text at 50 %): 4.86 on void. */
  outline: 'rgba(244,242,238,0.50)',
  /** A timestamp chip's fill (hot at 16 %); hotText on it over void 7.25. */
  hotSoft: 'rgba(255,77,109,0.16)',
  /** The hot glow behind a hot bar. */
  hotGlow: 'rgba(255,77,109,0.55)',
  /** The now bar's progress track and a thin rule on glass (10 % white). Decorative. */
  trackSoft: 'rgba(255,255,255,0.10)',
  /** A switch's track when off, and its thumb. The thumb carries the state; the track is decorative (1.50). */
  switchOff: '#2e2e36',
  /** The toast's action word, on the light toast (5.92). */
  toastAction: '#b0243f',
  /** The fade from the page to nothing — where a fade into the page starts. */
  clear: 'rgba(6,6,8,0)',
  /** Behind a sheet or a dialog (60 % black). Decorative. */
  scrim: 'rgba(0,0,0,0.60)',
  /**
   * M31 L7 (drawing: `.glowtext`, `#2A1530`, the pick and Moments scrims, the launch pill's line): the end of
   * the hot gradient (words "14:32" on Hot now: 6.2 on raise2, a 34 pt number), Premium's solid tile (the label
   * on it, text 14.6), the pick tile's foot (void at 92 %), the Moments scrim's three stops (10, 25, 94 %)
   * and the Skip pill's 15 % line. Fills and decoration; no word depends on a scrim alone.
   */
  hotEnd: '#a57bff',
  /** The pick's quoted note, lighter than text2 (11.0 on void). */
  quote: '#c9c7cf',
  premiumTint: '#2a1530',
  /** M31 W4-B (drawing `statusBase`: `linear-gradient(170deg,#2A1A4A,#060608 62%)`): the Stage's violet top, which the status viewer fades to the page. A fill; the words on it are `text` (15.1 on this tint). */
  stageTint: '#2a1a4a',
  /** M31 T033 (drawing `me--plus`): the PLUS banner's 1 px border and its crown — fill and border only, never words. */
  plusLine: '#3a2a55',
  plusMark: '#c9b5ff',
  pickFoot: 'rgba(6,6,8,0.92)',
  scrimTop: 'rgba(6,6,8,0.10)',
  scrimMid: 'rgba(6,6,8,0.25)',
  scrimFoot: 'rgba(6,6,8,0.94)',
  /** The number badge on a cover (Manage order): void at 75 %, words in text (design-pulse2 `subscriptions-manage--screen`). */
  badgeScrim: 'rgba(6,6,8,0.75)',
  glassEdge: 'rgba(255,255,255,0.15)',
  /** Ring pins and avatar discs — the drawings' green, violet, blue. Decorative marks (words on them are void or none). */
  pinGreen: '#22c55e',
  pinBlue: '#3b82f6',
  /** M31 F2a: the drawings' amber avatar disc (`av('K','#F59E0B')`); decoration, its letter is void (8.4). */
  pinAmber: '#f59e0b',
  /** M31 W3-B (drawing `glow('#3A3A44','#24242C',…)` on the not-found and missing-episode pages): the grey glow's first stop (its second is `line`). Decoration; no word sits on it alone. */
  glowGrey: '#3a3a44',
  /** M31 D-C (drawing `category--screen`, the light 2 x 3 card): the author line on the light fill (#55545C, 6.8 on text) and the box the newest episode sits in (#E6E3DD, void words on it 15.6). */
  onLight2: '#55545c',
  lightBox: '#e6e3dd',

  // ---- Older role names, now Pulse values (aliases until the last wave) ----------------------
  /** = void. */
  background: '#060608',
  /** = raise. */
  surface: '#111116',
  /** = line. Decorative. */
  border: '#24242c',
  /** = text2. */
  muted: '#a3a1ab',
  /** = hot: a fill. Words on it are `onPrimary`. */
  primary: '#ff4d6d',
  /** = void: words on a `primary` fill (6.30). */
  onPrimary: '#060608',
  /** = hotText: links, text actions, the listener's own marks. */
  accent: '#ff8095',
  /** Decorative: the scrubber's unfilled track (= barIdle). */
  track: 'rgba(255,255,255,0.40)',
  /** Carries information (the heat curve), so it must clear 3:1 — 3.73 on void (= barIdle). */
  bar: 'rgba(255,255,255,0.40)',
  /** Decorative: the hairline between rows (= line). */
  separator: '#24242c',
  /**
   * Facebook's brand blue, only for its own mark on "Continue with Facebook" (owner,
   * 2026-09-27). #1877F2 per the brand-colour references; never used as a UI colour.
   */
  facebook: '#1877f2',
  /** = hotSoft: the disc behind a list row's play glyph (glyph on it over void 7.25). */
  accentTint: 'rgba(255,77,109,0.16)',
  /** The disc behind a podcast play glyph on a row: the light circle of the drawings. */
  playDisc: '#f4f2ee',
  playGlyph: '#060608',
  /** The veil over the player's blurred artwork — the page at 88 %. */
  veil: 'rgba(6,6,8,0.88)',
  /** The track behind a `Segmented` choice (= raise2). Text2 words on it 6.79. */
  segment: '#1a1a21',
  /** Decorative: the 40 × 5 handle on top of a sheet (= grab). */
  handle: 'rgba(255,255,255,0.20)',
  /** The main Play buttons: the light circle of the drawings, a void glyph on it (18.11). */
  play: '#f4f2ee',
  onPlay: '#060608',
} as const;

export type Palette = { readonly [K in keyof typeof colour]: string };

/**
 * M12 FR-108: accent themes — SocialNet's own, not 小宇宙's (FR-110). Each swaps four accent
 * tokens, and (M31) the Pulse `hot` / `hotText` follow `primary` / `accent`, so a redrawn screen
 * takes the listener's colour too. Dark only since M31: every accent is a light tone that reads
 * on the near-black page, with `void` words on its fill. Measured with `contrast.ts` before
 * adoption (2026-10-27) and re-checked on every run by `ACCENT_PAIRS` (guard G-A1b): accent on
 * void / raise / raise2, words on the fill, the play glyph on its tint. "sunrise" is the brand
 * palette (hot). The `light` key is the old shape, kept so no caller changes; there is no dark.
 */
export type AccentKeys = { primary: string; onPrimary: string; accent: string; accentTint: string };
export const ACCENTS = {
  sunrise: { label: 'Sunrise', light: { primary: colour.primary, onPrimary: colour.onPrimary, accent: colour.accent, accentTint: colour.accentTint } },
  teal: { label: 'Teal', light: { primary: '#2dd4bf', onPrimary: '#060608', accent: '#2dd4bf', accentTint: 'rgba(45,212,191,0.16)' } },
  coral: { label: 'Coral', light: { primary: '#fb7185', onPrimary: '#060608', accent: '#fb7185', accentTint: 'rgba(251,113,133,0.16)' } },
  violet: { label: 'Violet', light: { primary: '#a78bfa', onPrimary: '#060608', accent: '#a78bfa', accentTint: 'rgba(167,139,250,0.16)' } },
  forest: { label: 'Forest', light: { primary: '#4ade80', onPrimary: '#060608', accent: '#4ade80', accentTint: 'rgba(74,222,128,0.16)' } },
  ocean: { label: 'Ocean', light: { primary: '#60a5fa', onPrimary: '#060608', accent: '#60a5fa', accentTint: 'rgba(96,165,250,0.16)' } },
  plum: { label: 'Plum', light: { primary: '#e879f9', onPrimary: '#060608', accent: '#e879f9', accentTint: 'rgba(232,121,249,0.16)' } },
} as const satisfies Record<string, { label: string; light: AccentKeys }>;
export type AccentName = keyof typeof ACCENTS;

/**
 * The older size steps (M7's xs 12, sm 16, base 20, lg 24 and M17's micro 11, meta 13, body 14,
 * title 17, hero 28, display 32; `lead` 15 and the `md` alias were deleted in T101 with 0 callers) stay for screens not yet redrawn; classes `text-<name>`.
 *
 * M31 adds the Pulse steps under a `pulse-` prefix (the older `title`, `hero`, `body` mean other
 * sizes). Sizes and line heights from `kit.css` + `design-pulse/index.html` §System — see `typeScale`
 * below for the face and tracking that go with each. Classes: `text-pulse-hero` … Redrawn screens
 * use these only; when the last wave is done the older names are deleted and the prefix can go.
 */
export const fontSize = {
  micro: 11, xs: 12, meta: 13, body: 14, sm: 16, title: 17, base: 20, lg: 24, hero: 28, display: 32,
  'pulse-hero': 30, 'pulse-title': 22, 'pulse-heading': 20, 'pulse-section': 17, 'pulse-row': 15, 'pulse-body': 15,
  'pulse-compact': 14, 'pulse-note': 14, 'pulse-lede': 18, 'pulse-statement': 24, 'pulse-caption': 13, 'pulse-mono': 12, 'pulse-edge': 11, 'pulse-badge': 10, 'pulse-tag': 11, 'pulse-chip': 12, 'pulse-quote': 14, 'pulse-figure': 34,
} as const;

/**
 * How tall each font draws a line, as a share of its size (the `hhea` ascent + descent + gap, read
 * from the font files in @expo-google-fonts, 2026-10-27): Unbounded 1.24, Geist 1.30, Geist Mono
 * 1.30. Android clips text to its line height, so a line is never set shorter than the font needs
 * (the M17 defect: "the text has been cropped", Lora at 1.28). The drawings' Unbounded lines are
 * tighter than that (Hero 30/31 = 1.03), so those steps get the taller `lineSafe`; a deviation from
 * the drawing, forced by the font, reported in the gate log.
 */
export const FACE_LEADING = { display: 1.24, ui: 1.3, mono: 1.3 } as const;

function step<F extends keyof typeof FACE_LEADING>(face: F, cls: string, size: number, line: number, tracking: number): { face: F; cls: string; size: number; line: number; lineSafe: number; tracking: number } {
  return { face, cls, size, line, lineSafe: Math.max(line, Math.ceil(size * FACE_LEADING[face])), tracking };
}

/**
 * The Pulse type scale by meaning (design-pulse §System; sizes in `kit.css`). `face` is the class
 * that picks the font file (`src/design/fonts.ts` `familyFor`), `tracking` is letter spacing in px
 * (hero −1 % of 30 = −0.3; the edge label 0.24 em of 11 = 2.64). Use `typeStyle(name)` for the
 * line height and tracking, and the `className` for size, face and colour. The sizes/lines below
 * are the DRAWN ones; `lineSafe` is what is set (the drawn line, or the font's own height if taller —
 * Unbounded steps; see `FACE_LEADING`).
 *
 *   Hero     Unbounded 800  30/31 −1 %   moment titles, the player title, a title bar
 *   Title    Unbounded 700  22/26        screen titles
 *   Heading  Unbounded 700  20/23        sheet and dialog titles, a title bar once scrolled
 *   Section  Geist 600      17/22        section heads
 *   Row      Geist 600      15/20        row and card titles, button words
 *   Body     Geist 400      15/22        comments, notes
 *   Compact  Geist 600      14/18        the now bar's title
 *   Note     Geist 500      14/20        a toast, the line under an empty state's title
 *   Lede     Unbounded 700  18/22        an empty state's title
 *   Statement Unbounded 700 24/29        the sentence on a whole-page offline / error state
 *   Caption  Geist 500      13/18        show names, meta, chips (600 when chosen)
 *   Mono     Geist Mono 500 12/22        every timestamp, time, count
 *   Edge     Unbounded 700  11  0.24 em  the vertical label on a section's left edge
 *   Badge    Geist Mono 600 10/16        a tab badge
 *   Tag      Geist Mono 500 11/14        a tile's eyebrow and counts, the Moments action labels (M31 L7)
 *   Chip     Geist 600 12/16             the Moments sound pill's words (M31 L7)
 *   Figure   Unbounded 800 34/34         Hot now's timestamp (M31 L7)
 *   Quote    Geist 400 14/20             the owner's note on the pick tile, in italics (M31 L7)
 */
export const typeScale = {
  hero: step('display', 'font-display font-extrabold text-pulse-hero', 30, 31, -0.3),
  title: step('display', 'font-display text-pulse-title', 22, 26, 0),
  heading: step('display', 'font-display text-pulse-heading', 20, 23, 0),
  section: step('ui', 'font-semibold text-pulse-section', 17, 22, 0),
  row: step('ui', 'font-semibold text-pulse-row', 15, 20, 0),
  body: step('ui', 'text-pulse-body', 15, 22, 0),
  compact: step('ui', 'font-semibold text-pulse-compact', 14, 18, 0),
  note: step('ui', 'font-medium text-pulse-note', 14, 20, 0),
  lede: step('display', 'font-display text-pulse-lede', 18, 22, 0),
  statement: step('display', 'font-display text-pulse-statement', 24, 29, 0),
  caption: step('ui', 'font-medium text-pulse-caption', 13, 18, 0),
  mono: step('mono', 'font-mono text-pulse-mono', 12, 22, 0),
  edge: step('display', 'font-display text-pulse-edge', 11, 11, 2.64),
  badge: step('mono', 'font-mono font-semibold text-pulse-badge', 10, 16, 0),
  tag: step('mono', 'font-mono text-pulse-tag', 11, 14, 0),
  chip: step('ui', 'font-semibold text-pulse-chip', 12, 16, 0),
  quote: step('ui', 'text-pulse-quote', 14, 20, 0),
  figure: step('display', 'font-display font-extrabold text-pulse-figure', 34, 34, 0),
};
export type TypeName = keyof typeof typeScale;

/** Line heights (px) for the Pulse steps, as `--text-<name>--line-height` in the CSS: the safe ones. */
export const lineHeight: Record<string, number> = Object.fromEntries(Object.entries(typeScale).map(([k, v]) => [`pulse-${k}`, v.lineSafe]));

/** The line height (the safe one — see `FACE_LEADING`) and letter spacing of a Pulse step, as a style (size, face and colour come from the classes). */
export function typeStyle(name: TypeName): { lineHeight: number; letterSpacing: number } {
  return { lineHeight: typeScale[name].lineSafe, letterSpacing: typeScale[name].tracking };
}

/**
 * M12 (FR-051, FR-052): one 20 pt side margin on every page, sections 16 apart.
 * M31 scale (design-pulse §System): 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48, named so a class never
 * carries a bare number: `hair` 4, `gap` 8, `row` 12, `section` 16, `screenX` 20 (the gutter),
 * `block` 24, `group` 32, `region` 48 — classes `p-gap`, `gap-row`, `px-screen-x` …
 * `gutterNarrow` is the gutter on a phone narrower than `narrowBelow` (375).
 */
export const spacing = { hair: 4, gap: 8, row: 12, section: 16, screenX: 20, block: 24, group: 32, region: 48, gutterNarrow: 16, narrowBelow: 375 } as const;

/** The side gutter for a window of this width: 20, or 16 on phones narrower than 375. */
export function gutter(windowWidth: number): number {
  return windowWidth < spacing.narrowBelow ? spacing.gutterNarrow : spacing.screenX;
}

/** M12 FR-050: a list row is 50 pt tall at the default text size, and grows with it. */
export const size = { row: 50 } as const;

/**
 * M17: cards and rows in cards 16, artwork 16 (22 at 96 pt and up). M31 (design-pulse §System,
 * `kit.css`): chip 7, small cover 12, now bar / input 18, cover / card 24, dialog 28, sheet 32,
 * button 24, tick 2 (one heat bar) (a 48 pt pill is `pill`).
 */
export const radius = { row: 16, artwork: 16, artworkLarge: 22, pill: 999, sheet: 32, chip: 7, small: 12, bar: 18, input: 18, card: 24, cover: 24, dialog: 28, button: 24, toast: 16, tick: 2 } as const;

/**
 * M24 US18: a cover's corner by its size, measured on the B designs (square art and its radius):
 * 40–44 → 8–10, 48–64 → 12, 72–132 → 14, 148 → 16, 156 up → 18. Read lowest first: the first
 * step whose `upTo` is at least the size wins. (Pulse covers: 42 → 10, 150 → 22 — passed by the screen.)
 */
export const coverRadius: readonly { upTo: number; r: number }[] = [
  { upTo: 44, r: 10 },
  { upTo: 64, r: 12 },
  { upTo: 132, r: 14 },
  { upTo: 152, r: 16 },
  { upTo: Infinity, r: 18 },
];

/** M6 FR-015, carried forward: nothing a listener taps is smaller than this. */
export const hit = { min: 48 } as const;

/**
 * The Pulse bars, bottom to top (design-pulse2 `index.html` §Bars): the tab bar is 58 + the safe
 * area, the now bar floats 8 above it (58 tall, 10 from each side, shrinks to a 52 circle), the
 * title bar sits above whichever is highest (8 above a tab bar, 10 above a now bar — the drawings' numbers). `rail` is the tab bar on a wide window. Touch
 * targets: a title bar's circles and a now bar's buttons are 44 (`circle`), the Play circle 40.
 */
export const bars = {
  tab: 58, rail: 88, tabIcon: 26, tabIconTop: 14, tabDotGap: 7, now: 58, nowGap: 8, nowSide: 10, nowCircle: 52, fade: 200,
  circle: 44, playCircle: 40, cover: 42, progress: 2, dot: 5, dotSmall: 7, badge: 16, titleBack: 44, titleShrunk: 20, chip: 36, chipPad: 14, titleSub: 6, sheetGap: 14, sheetClose: 36, toastLift: 8, toastOverComposer: 162, toastOverReplies: 142, toastOverClip: 96, toastOverVoice: 90, toastOverStatus: 70, toastOverTranscript: 142, tray: 60, toastOverTray: 12, toastFootIdle: 62, toastFootPage: 126, toastFootSend: 186, toastFootDigest: 182, toastFootSearch: 156, toastFootAppeal: 156, toastFootGift: 166, toastFootProfile: 70, toastTabTitle: 132, pushedGap: 6, titleAboveNow: 10, toastSide: 14, dialogSide: 28, dialogPad: 22, stamp: 22, stampPad: 7, toast: 50, sheetGrab: 36, field: 48,
} as const;

/**
 * The room a page leaves at its foot so content never hides behind a bar (review D5): the tab
 * bar (when `tabs`), the now bar and its gap (when `now`), and the safe area `safe`.
 */
export function bottomInset(safe: number, opts: { tabs?: boolean; now?: boolean } = {}): number {
  return safe + (opts.tabs === true ? bars.tab : 0) + (opts.now === true ? bars.now + bars.nowGap : 0);
}

/**
 * Where the now bar's bottom edge sits above the screen's bottom edge. Over a tab bar it floats
 * `nowGap` (8) above it — 100 on a 34 pt inset. On a pushed page (no tab bar) the drawings put it
 * 40 up, which is the inset plus `pushedGap` (6).
 */
export function nowBarBottom(safe: number, opts: { tabs?: boolean } = {}): number {
  return opts.tabs === true ? safe + bars.tab + bars.nowGap : safe + bars.pushedGap;
}

/**
 * Where a title bar's bottom edge sits, given the bars below it, from the drawings' own numbers:
 * 100 over a tab bar, 168 over a tab bar and a now bar (10 above the now bar's top — the text
 * of the drawing says 8), 40 on a pushed page, 108 on a pushed page with a now bar.
 */
export function titleBarBottom(safe: number, opts: { tabs?: boolean; now?: boolean } = {}): number {
  if (opts.now === true) return nowBarBottom(safe, opts) + bars.now + bars.titleAboveNow;
  return nowBarBottom(safe, opts);
}

/**
 * Where a toast's bottom edge sits, from which bars are showing (design-pulse2 index.html §Bars; the
 * drawings' own toasts): 8 above the title bar's spot. With both bars that is 176 on a 34 pt inset,
 * with the tab bar alone 108, on a pushed page 48, with a now bar on a pushed page 116. On the
 * player (`player: true`, no bars; drawings `player--*` toast at 112) it clears the tray: the
 * tray's top is `pushedGap` + 60 above the inset, and the toast sits `toastOverTray` (12) over it.
 * No options = both bars (what a toast over the tab screens usually clears).
 */
export function toastBottom(safe: number, opts: { tabs?: boolean; now?: boolean; player?: boolean; foot?: 'page' | 'send' | 'digest' | 'search' | 'appeal' | 'gift' | 'profile'; composer?: 'comments' | 'replies' | 'clip' | 'voice' | 'transcript' | 'status'; updates?: boolean } = { tabs: true, now: true }): number {
  // The Comments pages (social.html `comments--toast` 196, `comment-thread--toast` 176 on a 34 pt
  // inset): the composer is the bottom zone, so the toast clears it instead of landing on it.
  if (opts.composer === 'comments') return safe + bars.toastOverComposer;
  if (opts.composer === 'replies') return safe + bars.toastOverReplies;
  // M31 W3-B: the New clip page's bottom zone (caption field + Preview / Save) is drawn with its toast at 130 on a 34 pt inset, the voice status page's at 124.
  if (opts.composer === 'clip') return safe + bars.toastOverClip;
  if (opts.composer === 'voice') return safe + bars.toastOverVoice;
  // M31 W4-B: the status viewer's toasts are drawn at 104 on a 34 pt inset (above the reply box); the text status page's, at 124, is the voice page's.
  if (opts.composer === 'status') return safe + bars.toastOverStatus;
  // The transcript page's "Copied." sits at 176 on a 34 pt inset (toast--transcript): above the Back to now chip, not over the title bar.
  if (opts.composer === 'transcript') return safe + bars.toastOverTranscript;
  // M31 F8 (wave-5): a pushed page whose title bar (and foot button) sits at the foot. The drawn toasts (settings.html `tst` 160, feedback / network 220,
  // discover.html digest 216, tell-editors 190 on a 34 pt inset, with the mini player) clear it; with no now bar the toast sits 8 over the title bar's top (84 + 8).
  if (opts.foot !== undefined) {
    if (opts.now !== true) return safe + bars.toastFootIdle;
    return safe + (opts.foot === 'send' ? bars.toastFootSend : opts.foot === 'digest' ? bars.toastFootDigest : opts.foot === 'search' ? bars.toastFootSearch : opts.foot === 'appeal' ? bars.toastFootAppeal : opts.foot === 'gift' ? bars.toastFootGift : opts.foot === 'profile' ? bars.toastFootProfile : bars.toastFootPage);
  }
  if (opts.player === true) return safe + bars.pushedGap + bars.tray + bars.toastOverTray;
  // M31 F9: the Updates tab's title bar is tall (toast--library 300 on a 34 pt inset with both bars): the toast sits `toastTabTitle` over the title bar's spot.
  if (opts.updates === true) return titleBarBottom(safe, opts) + bars.toastTabTitle;
  return titleBarBottom(safe, opts) + bars.toastLift;
}

/**
 * A glow, not a shadow (design-pulse §System: "no drop shadows; depth is a glow (hot 0 0 24 /
 * 35 %) or a lighter surface"). React Native's `shadowRadius` is half CSS's blur, so 24 → 12.
 * `dot` is the active-tab dot's 10 px glow.
 */
export const glow = {
  hot: { color: colour.hot, opacity: 0.35, radius: 12 },
  dot: { color: colour.hot, opacity: 1, radius: 5 },
  /** A lit heat bar on a Moments card: drawn `0 0 8px rgba(255,77,109,.7)` → radius 4 (M31 L7). */
  bar: { color: colour.hot, opacity: 0.7, radius: 4 },
  cover: { color: colour.hot, opacity: 0.35, radius: 30 },
} as const;

/**
 * Motion, in ms (design-pulse §System): tap 120, move 240, sheet 360 (spring, damping ratio 0.9),
 * a Moments comment rises over 4 s, the buffering ring breathes on a 2.4 s loop, a long-pressed
 * tab shows its name for 1.2 s, the now bar comes back after 600 ms still. Reduce Motion: no
 * rise, no breathe, fades only — see `useReducedMotion` in the kit.
 */
export const motion = { tap: 120, move: 240, sheet: 360, sheetDamping: 0.9, rise: 4000, breathe: 2400, bubble: 1200, nowReturn: 600, longPress: 350 } as const;

/**
 * Fixed-width digits, so a ticking time does not jitter. The one style Tailwind cannot
 * express here: `tabular-nums` compiles to nothing on native (NativeWind drops
 * `font-variant-numeric`), and token-check rejects the class for that reason.
 */
export const tabular = { fontVariant: ['tabular-nums'] } as { fontVariant: ['tabular-nums'] };

export type Colour = keyof typeof colour;

/**
 * M31 round 2 (owner, 2026-10-28: "the design … I want completely same"): every number and colour the
 * Pulse player is drawn with that no other screen shares, written once, copied from
 * `design-pulse2/index.html#player--screen`, `listen.html` (`playerBody`, the More and Playback sheets,
 * the end offer, nothing playing) and `kit.js` (`nowbar`, `ring`). The drawing is a 390 × 844 phone: its
 * 50 pt status bar and its 34 pt home inset are `statusBar` and `homeInset`, and every offset below is
 * measured from the top (`*Top`) or the bottom (`*Bottom`) edge of that frame. A device whose inset is
 * larger moves the page by the difference (`playerLayout` in `src/ui/player/measures.ts`).
 *
 * The page's own glow colours (`glowPink` #FF6B8B, `glowIndigo` #5B3DF5) are not the brand pair: the
 * drawing's player glow uses them (`glow('#FF6B8B','#5B3DF5',-60,.6)`).
 */
/**
 * The Share sheet (design-pulse2 listen.html `player--share-sheet`): two preview cards 250 × 150 (radius 22,
 * 10 apart, a 2 px light ring on the chosen one, 12 / 10 of padding), then a row of 56 targets (radius 18,
 * name 11 under it), then the format tiles (`player.tile*`).
 */
export const share = {
  cardWidth: 250, cardHeight: 150, cardRadius: 22, cardGap: 10, cardRing: 2, cardPadX: 12, cardPadY: 10, cardCurve: 16, cardCurveBars: 40,
  target: 56, targetRadius: 18, targetIcon: 24, targetGap: 6,
} as const;

/** The Like sheet (design-pulse2 `episode--like-sheet`): a 52 heart disc, "Liked" Unbounded 22, a 100 field (radius 18, padding 14), buttons 10 apart. */
export const like = { heart: 52, heartIcon: 26, headGap: 12, field: 100, fieldRadius: 18, fieldPad: 14, buttonGap: 10 } as const;

export const player = {
  // ---- the frame ------------------------------------------------------------------------------------
  statusBar: 50,
  homeInset: 34,
  // ---- positions (px from the frame's top / bottom) --------------------------------------------------
  /** The top row (close · pill · More): 58 from the top = 8 under the status bar. */
  topBarBelowStatus: 8,
  /** The ring's top: 118 = 68 under the status bar. */
  ringBelowStatus: 68,
  /** The time bubble's top edge sits this far below the ring's centre (298 − 283). */
  bubbleBelowCentre: 15,
  titleBottom: 226,
  controlsBottom: 124,
  trayBottom: 40,
  offerBottom: 116,
  /** Left / right margin of the top row, the title block and the controls. */
  side: 20,
  traySide: 12,
  /** Nothing playing: the sentence's bottom, and the two pills' bottom. */
  emptyTextBottom: 150,
  emptyPillsBottom: 40,
  emptyPillGap: 10,
  emptyRingInset: 62,
  // ---- sizes ----------------------------------------------------------------------------------------
  ring: 330,
  inner: 0.62,
  /** Room the title block needs above the controls on a short window (two lines of the 26 / 33 title = 66, the show line 18, a 12 gap = 96; M31 F13 was 90). */
  titleRoom: 96,
  play: 80,
  skip: 30,
  moon: 44,
  speedLabel: 44,
  tray: 60,
  trayRadius: 22,
  trayItem: 48,
  trayGap: 12,
  trayIcon: 22,
  trayCountGap: 6,
  /** The pill at the top: 32 tall, glass, 12 of padding each side, 6 between the flame and the words. */
  pill: 32,
  pillPad: 12,
  pillGap: 6,
  /** The title: Unbounded 800 26 on a 27 line in the drawing (26 × 1.04); 33 is set, the font's own height — Android clips a shorter line. */
  title: 26,
  titleDrawnLine: 27,
  titleLine: 33,
  /** The show line under the title: 6 below, 18 tall. */
  showGap: 6,
  showLine: 18,
  /** Title and Follow side by side, 12 apart; "Follow" is 34 tall, 14 of padding. */
  titleRowGap: 12,
  follow: 34,
  followPad: 14,
  followText: 13,
  /** The time bubble: mono 12, 4 / 8 of padding, radius 8. */
  bubblePadX: 8,
  bubblePadY: 4,
  bubbleRadius: 8,
  /** The skip glyphs, the play glyph, the moon glyph, the speed label's size. */
  playGlyph: 32,
  moonGlyph: 24,
  speedText: 14,
  /** The page glow's height, and how far it sits above the top (drawing `glow(…, −60, .6)`). */
  glowHeight: 520,
  glowTop: -60,
  glowOpacity: 0.6,
  // ---- the empty player -----------------------------------------------------------------------------
  emptyTitle: 26,
  emptyTitleLine: 33,
  emptyIcon: 56,
  // ---- the More sheet ---------------------------------------------------------------------------------
  tileHeight: 84,
  tileGap: 10,
  tilePadY: 12,
  tilePadX: 14,
  tileIcon: 22,
  tileDetail: 11,
  tileDetailLine: 14,
  tileOutline: 1.5,
  headCover: 56,
  headShow: 12,
  headTitle: 16,
  headTitleLine: 20,
  chapterPadY: 10,
  chapterPadX: 12,
  chapterRowPadY: 7,
  chapterRowPadX: 4,
  chapterMini: 30,
  // ---- the Playback sheet -----------------------------------------------------------------------------
  /** A tile on the second page and the "More settings" row: radius 20, padding 14, rows 56 tall. */
  panelRadius: 20,
  panelPad: 14,
  panelGap: 10,
  panelRow: 56,
  panelIcon: 34,
  panelIconRadius: 11,
  panelIconGlyph: 18,
  panelDetail: 12,
  /** A tile's detail line is drawn 12 on a 16 (1.35); the `caption` step's 18 made the More-settings tile 5 taller than drawn. 16 is the face's own height at 12 (15.6). */
  panelDetailLine: 16,
  /** The + / − circles, and their glyph size. */
  stepButton: 48,
  stepGlyph: 20,
  /** The preset chips: 36 tall, 6 apart, mono 13. */
  chip: 36,
  chipGap: 6,
  chipText: 13,
  /** "0.5" and "3.0" under the dial are the page's 15 pt mono. */
  dialEnd: 15,
  /** `.cap`: Geist Mono 500 11, tracking .08 em, uppercase, text3. */
  capSize: 11,
  capLine: 14,
  capTracking: 0.88,
  /** The sheet's small notes ("The sound fades out…"): 12 / 1.4. */
  note: 12,
  noteLine: 17,
  sleepRing: 46,
  sleepHead: 12,
  /** The sleep line is drawn on a 12 line (`font:500 12px/1`); 16 is the mono face's own height, the least Android will not clip. */
  sleepHeadLine: 16,
  moreTitle: 24,
  // ---- the now bar --------------------------------------------------------------------------------------
  /** Gap between the cover, the words and the buttons inside the bar (the drawing's `gap:10`). */
  nowGap: 10,
  nowPad: 8,
  // ---- smaller numbers the drawing uses once --------------------------------------------------------------------
  pillLine: 17,
  bubbleLine: 16,
  /** The ring button's outline width (`.btn.ring`, 1.5). */
  outline: 1.5,
  offerPad: 14,
  offerTitle: 15,
  offerTitleLine: 19,
  offerLabelGap: 4,
  offerPlay: 44,
  offerPlayPad: 16,
  offerCover: 64,
  offerPlayGlyph: 14,
  /** A chapter row is 36 tall, rows 2 apart, 10 between a row's parts. */
  chapterRow: 36,
  chapterRowGap: 2,
  chapterGap: 10,
  /** The drawn sheet: 8 above the grabber, 44 under the last part. */
  sheetTop: 8,
  sheetFoot: 44,
  speedGap: 14,
  stepLine: 24,
  chipLine: 16,
  speedFiner: 20,
  speedFinerLine: 26,
  dialEndLine: 18,
  sleepMoon: 26,
  sleepChipMoon: 16,
  sleepClockText: 34,
  sleepClockLine: 42,
  sleepRingText: 13,
  sleepDotSmall: 11,
  sleepDot: 14,
  panelRowPadY: 12,
  rowGap: 12,
  detailGap: 2,
  moreTitleLine: 29,
  /** The 26-bar speed slider: 24 tall, 3 apart. The sleep rings' stroke 4 (the clock's track 6); the empty ring's line 2; a chapter's six-bar curve 14 tall, 1 apart, 3 at least. */
  speedBar: 24,
  speedBarGap: 3,
  sleepStroke: 4,
  sleepTrack: 6,
  emptyStroke: 2,
  chapterBars: 14,
  chapterBarsGap: 1,
  chapterBarsMin: 3,
  // ---- colours that belong to this page only -------------------------------------------------------------
  glowPink: '#ff6b8b',
  glowIndigo: '#5b3df5',
  /** The top pill's glass: raise2 at 70 % (the Moments pill is 45 %, the now bar 86 %). */
  pillFill: 'rgba(26,26,33,0.70)',
  /** The time bubble's fill: void at 60 %. */
  bubbleFill: 'rgba(6,6,8,0.60)',
  /** The tray's icons and count: the text colour at 85 %. 15.2 on raise. */
  trayInk: 'rgba(244,242,238,0.85)',
  /** The cover's glow (the drawing's `box-shadow: 0 0 60px rgba(255,107,139,.35)`). */
  coverGlow: '#ff6b8b',
  /** The detail line of a light (on) tile: #3A3A44 on the light fill. */
  tileOnDetail: '#3a3a44',
  /** The 1 px rule between the rows of a Panel tile. Decorative. */
  rowRule: '#1e1e25',
  /** The empty player's headphones (the drawing's #3A3A44): decorative, no words. */
  emptyInk: '#3a3a44',
} as const;

/**
 * M31 W3-A (T040; design-pulse2 `listen.html`: `episodeBody`, `epTitle`, `epTray`, `episode--screen`, the notes,
 * clips and related decks, `episode--more-sheet` and its two variants, `show-info--screen`): every number the Pulse
 * Episode page is drawn with that no other screen shares. The drawing is a 390 × 844 phone with a 50 pt status bar and
 * a 34 pt home inset; offsets are from the top (`*Top`, `*BelowStatus`) or the bottom (`*Bottom`) edge. A device with a
 * larger inset moves the page by the difference (`episodeLayout` in `src/ui/episode/measures.ts`).
 *
 *   cover 470 (veil to 480) · pills 64 · curve 330 (70 bars, 40) · counts 384 · title block bottom 112 · tray bottom 40 (60)
 *   scrolled: the cover leaves, the glow stays; sections are named by an edge label, content starts 28 from the left
 */
/** F3 (design-pulse2 `like--screen`): the Like page's stage. The veil is void at 10 % to the page; the episode strip is raise at 80 %. */
export const likeStage = {
  veilTop: 'rgba(6,6,8,0.10)',
  stripFill: 'rgba(17,17,22,0.80)',
} as const;

/**
 * M31 S-A (T060; design-pulse2 `settings.html` `big`, `minorPage`): the two colours the Settings pages draw that the
 * palette has no role for — a switch tile that is ON (`#1D1218`, raise tinted toward hot) and its 1 px ring
 * (hot at 35 %). Fills and a ring; the words on the wash are `text` (17.2) and `hotText` (7.0). The minor-mode disc's
 * glow is `colour.hotGlow`. Kept out of `colour` so the three CSS blocks in `global.css` need no new variable.
 */
export const settingsColour = {
  wash: '#1d1218',
  ring: 'rgba(255,77,109,0.35)',
} as const;

/** M31 W6-A (design-pulse2 `giftPhone`: `glow('#F472B6','#7A3CFF',-60,.6)`, the cover's pink glow): the gift page's pink. A glow and a fill; no word sits on it alone. */
export const giftColour = { pink: '#f472b6' } as const;

/** The Show screen (W3-A2, design-pulse2 `showBody`): the glass of its search and ⋯ circles, raise at 70 %. */
export const showGlass = 'rgba(17,17,22,0.7)';

export const episode = {
  statusBar: 50,
  homeInset: 34,
  // ---- the stage ----------------------------------------------------------------------------------------------
  coverHeight: 470,
  veilHeight: 480,
  /** The veil over the cover: void at 15 % at the top, 40 % half way, then the page. */
  veilTop: 'rgba(6,6,8,0.15)',
  veilMid: 'rgba(6,6,8,0.40)',
  pillsBelowStatus: 14,
  pillHeight: 32,
  pillRadius: 16,
  pillPadX: 12,
  pillGap: 6,
  /** The pills' glass: void at 45 % (the drawing's `.blur` pill). */
  pillFill: 'rgba(6,6,8,0.45)',
  curveTop: 330,
  curveBars: 70,
  curveHeight: 40,
  curveMin: 3,
  /** Bars 20 to 24 are the drawn hot run: five bars. */
  hotRunBars: 5,
  countsTop: 384,
  side: 20,
  // ---- the thumb zone -----------------------------------------------------------------------------------------
  titleBottom: 112,
  trayBottom: 40,
  fadeHeight: 300,
  /** The fade once the page has scrolled (`fade(0,260)` on the drawing's right phone). */
  fadeScrolled: 260,
  titleGap: 12,
  buttonsGap: 10,
  title: 28,
  titleLine: 35,
  showLine: 13,
  ringPadX: 18,
  // ---- the scrolled sections ----------------------------------------------------------------------------------
  /** Content leaves a 28 lane for the edge label and ends 16 from the right. */
  lane: 28,
  right: 16,
  sectionGap: 22,
  noteLine: 23,
  notePicture: 130,
  pictureRadius: 18,
  clipCard: { width: 200, height: 120, radius: 20 },
  relatedCard: { width: 200, cover: 90, radius: 20 },
  deckGap: 10,
  /** The dashed empty card: 180 tall, radius 22, a 1.5 dashed line. */
  emptyCard: { height: 180, radius: 22, line: 1.5 },
  // ---- the More sheet -------------------------------------------------------------------------------------------
  headCover: 64,
  headCoverSmall: 48,
  headShow: 12,
  headTitle: 16,
  headTitleLine: 20,
  tileGap: 10,
  /** The playlist picker's tiles: 84 tall, radius 20, cover colour behind a foot gradient. */
  pickerTile: 84,
  noteBox: { height: 110, radius: 18, pad: 14 },
  noteBars: 60,
  noteBarsHeight: 30,
  // ---- show info --------------------------------------------------------------------------------------------------
  infoTop: 70,
  infoTile: { radius: 20, pad: 14, row: 56, icon: 34, iconRadius: 11 },
  errorLine: '#3a1f28',
} as const;

// ---- M31 S-C (T061): sign-in, Terms and onboarding colours ----
/**
 * M31 S-C (T061; design-pulse2 `settings.html`, `kit.js` `ARTS`): the tile paints of the sign-in art wall, the unticked box's
 * outline (`#4A4A54`, 1.5), the dot of an empty passcode / box, the chosen reason's wash on "Not liking these?" (`#1D1218` with a
 * 1.5 ring of hot) and the refusal ring round a suspended account (hot at 35 %). Fills, lines and decoration only: every word
 * on them is `text`, `text2` or `hotText`. They live here, the one place a hex is allowed.
 */
export const authColour = {
  /** The outline of an unticked box (`border:1.5px solid #4A4A54`) — graphic only; the tick and the words carry the state. */
  boxRim: '#4a4a54',
  /** A chosen reason on "Not liking these?" (`background:#1D1218`): raise warmed toward hot. text on it 17.2. */
  reasonOn: '#1d1218',
  /** The ring round a refusal tile (`inset 0 0 0 1px rgba(255,77,109,.35)`). */
  refusalRing: 'rgba(255,77,109,0.35)',
} as const;

/** One art tile: a two-stop gradient and up to two discs, positions and sizes as shares of the tile's width. */
export type WallPaint = {
  from: string;
  to: string;
  /** CSS degrees; 180 is top to bottom. */
  angle: number;
  discs: readonly { x: number; y: number; r: number; colour: string }[];
};

/**
 * The eight tile paints of `kit.js` `ARTS` (a–h). CSS repeating, radial-at-an-edge and conic gradients have no React Native
 * equivalent, so each is drawn as the nearest two-stop gradient plus the drawing's discs — the same colours in the same places.
 */
export const WALL_PAINTS: Record<'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h', WallPaint> = {
  a: { from: '#5b3df5', to: '#1c1446', angle: 150, discs: [{ x: 0.25, y: 0.3, r: 0.26, colour: '#ff6b8b' }, { x: 0.72, y: 0.72, r: 0.2, colour: '#ffb86b' }] },
  b: { from: '#0f766e', to: '#115e59', angle: 120, discs: [] },
  c: { from: '#3a1f18', to: '#3a1f18', angle: 180, discs: [{ x: 0.5, y: 1.2, r: 0.55, colour: '#ff5a36' }] },
  d: { from: '#1e3a8a', to: '#3b82f6', angle: 90, discs: [] },
  e: { from: '#6b3a2a', to: '#2e1a14', angle: 200, discs: [{ x: 0.3, y: 0.3, r: 0.18, colour: '#e9e2d0' }] },
  f: { from: '#f59e0b', to: '#8b5cf6', angle: 30, discs: [{ x: 0.5, y: 0.5, r: 0.3, colour: '#ef4444' }] },
  g: { from: '#052e1a', to: '#0b3d2a', angle: 180, discs: [{ x: 0.5, y: 0.4, r: 0.22, colour: '#22c55e' }] },
  h: { from: '#831843', to: '#f472b6', angle: 135, discs: [] },
};

/** The order the wall's twelve tiles are drawn in (`signInPage`: a b c d e f g h a c e g). */
export const WALL_ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'a', 'c', 'e', 'g'] as const;
