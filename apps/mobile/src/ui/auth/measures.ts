// The sizes the sign-in, Terms and onboarding pages are drawn with, where the kit has no name for them.
/**
 * M31 S-C (T061; design-pulse2 `settings.html` `signInPage`, `emailPage`, `termsPage`, `legalPage`, `genreTiles`): every number
 * the Panel / Stage drawings of the account pages set that the scale and the kit do not carry. A screen writes
 * `style={AUTH_TYPE.wordmark}`; a number written for type in a style in a strict file is refused by `scripts/token-check.mjs`.
 * Lines are the font's own (Unbounded 1.24, Geist and Geist Mono 1.30 — `FACE_LEADING`), rounded up where the drawing's is tighter, so Android never clips a line.
 */
const t = (fontSize: number, lineHeight: number, letterSpacing?: number): { fontSize: number; lineHeight: number; letterSpacing?: number } =>
  letterSpacing === undefined ? { fontSize, lineHeight } : { fontSize, lineHeight, letterSpacing };

export const AUTH_TYPE = {
  /** "SocialNet" on the sign-in page: Unbounded 800 40, −3 %. */
  wordmark: t(40, 50, -1.2),
  /** "Before you continue" and the legal document's title: Unbounded 800 28. */
  sheetTitle: t(28, 35),
  /** "Keep your account?": Unbounded 800 26. */
  pendingTitle: t(26, 33),
  /** The refusal card's title and the Terms title: Unbounded 800 22. */
  cardTitle: t(22, 28),
  /** The typed words in a field (17), a cell's digit (Unbounded 700 26), the monogram's letters (Unbounded 800 44). */
  field: t(17, 23),
  cell: t(26, 33),
  monogram: t(44, 55),
  /** "Contents" numbers: Unbounded 700 14. */
  contentsNumber: t(14, 18),
  /** A legal document's body: Geist 400 15 on 26. */
  legalBody: t(15, 26),
  /** The consent line and a legal note: 13 on 19. */
  consent: t(13, 19),
  /** A sheet's line (`lineS` at 15): Geist 500 15 on 22. */
  sheetLine: t(15, 22),
  /** "Enjoying SocialNet?": Unbounded 800 21. */
  rateTitle: t(21, 27),
  /** "Coming soon": Unbounded 800 34. */
  comingSoon: t(34, 43),
  /** The age line and the under-14 button: Geist 500/600 14 on 20. */
  age: t(14, 20),
  /** The uppercase mono labels over a field (11, 8 % spaced) and the page eyebrow (12, 10 % spaced). */
  fieldLabel: { ...t(11, 15, 0.88), textTransform: 'uppercase' as const },
  eyebrow: { ...t(12, 16, 1.2), textTransform: 'uppercase' as const },
  /** The spoken reasons' labels on "Not liking these?": Geist 600 14. */
  reason: t(14, 19),
  /** "Tap to add or remove.": Geist 500 12 on 18. */
  fieldNote: t(12, 18),
  /** The counter beside Continue: Geist Mono 14. */
  counter: t(14, 20),
  /** A genre tile's name: Geist 600 13 on 16. */
  genre: t(13, 17),
} as const;

/** Sizes in points. */
export const AUTH = {
  /** The art wall: 12 from each side, 6 under the status bar, 430 tall, three columns, rows 96, gap 8, tiles 18 round, at 90 %. */
  wall: { side: 12, below: 6, height: 430, gap: 8, row: 96, radius: 18, opacity: 0.9, columns: 3 },
  /** The wall fades to void from 300 to 540 on the drawn phone: 250 under the status bar, 240 tall. */
  wallFade: { belowStatus: 250, height: 240 },
  /** The sign-in bottom zone: 24 from the sides, the icon 48 (radius 14) beside the wordmark, the email button 56 with its mark 20 from the left. */
  zone: { side: 24, gap: 14, icon: 48, iconRadius: 14, iconGap: 12, button: 56, mark: 20 },
  /** The tick box: 22, radius 7, a 1.5 rim; the text beside it is 10 away. */
  box: { size: 22, radius: 7, rim: 1.5, gap: 10 },
  /** An email / name field: 56 tall, radius 18, 14 of padding; its label 6 above. */
  field: { height: 56, radius: 18, pad: 14, gap: 6 },
  /** The code's six cells: 58 tall, radius 16, 8 apart. */
  cells: { count: 6, height: 58, radius: 16, gap: 8, ring: 1.5 },
  /** The name step's monogram: a 110 disc. */
  monogram: 110,
  /** The step spacers under the status bar: the email step 120, the code step 100, the name step 40. */
  lead: { email: 120, code: 100, name: 40 },
  /** The page body starts 8 under the status bar. */
  bodyTop: 8,
  /** Gap between the parts of a page body. */
  bodyGap: 12,
  /** A refusal / info tile: 22 round, 16 padding. */
  tile: { radius: 22, pad: 16, gap: 10 },
  /** The foot row under the title: a 52 button, 12 under the title, 6 above the edge; the title lifts to 70. */
  foot: { button: 52, titleGap: 12, continuePad: 34 },
  /** The Terms page: icon 56 (radius 16), cards 22 round, a head 14 / 16, points 10 apart. */
  terms: { icon: 56, iconRadius: 16, card: 22, headPadY: 14, headPadX: 16, gap: 10, pointGap: 10, disagree: 120 },
  /** The refusal card over Terms: 28 from each side, 22 round... radius is the kit dialog's. */
  refusal: { icon: 52, iconRadius: 15, gap: 14 },
  /** A genre tile (2 columns): 56 tall, radius 18, 12 padding, 8 apart. */
  genre: { height: 56, radius: 18, padX: 12, gap: 8, icon: 20, tick: 16 },
  /** A reason tile on "Not liking these?": 76 tall, radius 22, padding 12 / 14. */
  reason: { height: 76, radius: 22, padY: 12, padX: 14, ring: 1.5, icon: 20 },
  /** The Panel pages: content starts 28 from the left (the edge label's lane), the reasons' 2 × 2 is 10 apart. */
  panel: { lane: 28, tileGap: 10 },
  /** The "Tell us more…" box: at least 90 tall, radius 22, padding 16. */
  note: { minHeight: 90, radius: 22, pad: 16 },
  /** The rate sheet's close (36), thumbs disc (60) and buttons (52). */
  rate: { disc: 60, button: 52, gap: 14, lift: 6 },
  /** The coming-soon sheet's mark tile (56, radius 18), Got it (54) and second action (44). */
  soon: { tile: 56, tileRadius: 18, got: 54, second: 44 },
  /** The Settings hub: the hero tile 88, the large tiles 112, 10 apart; a group row 60. */
  hub: { hero: 88, tile: 112, gap: 10, avatar: 52, tileIcon: 24, row: 60 },
} as const;
