// The Studio's only colour file: light and dark palettes applied to the page.
/**
 * The Studio's only colour file (FR-028). Until M17 every colour came from the app's tokens
 * through the `@tokens` alias; since M17 (2026-10-03) the Studio holds its own copy of those
 * values, below, so the phone's new palette does not change the website (guard G-E5).
 * `test/tokens.test.ts` fails if a colour literal appears anywhere else in `src/`.
 *
 * One Studio-only role: `onFill` — words on the yellow fill. The app uses white there under
 * the owner's waiver (1.60); the Studio must meet WCAG AA, so it uses the light palette's text
 * colour on yellow in both themes (measured in the test).
 */
/*
 * M17 (constitution v3.0.0, FR-020, research R6): the phone app moved to the Editorial palette
 * and dropped dark mode; the Studio keeps its look. So the Studio no longer reads the app's file
 * — these are the app's values as they were on 2026-10-03 (before M17), copied here unchanged.
 */
const colour = {
  background: '#ffffff',
  surface: '#f5f5f7',
  text: '#111114',
  muted: '#5f6368',
  primary: '#fcc522',
  onPrimary: '#ffffff',
  accent: '#8a5a00',
  track: 'rgba(0,0,0,0.12)',
  bar: 'rgba(0,0,0,0.50)',
  separator: 'rgba(0,0,0,0.12)',
  scrim: 'rgba(0,0,0,0.40)',
  facebook: '#1877f2',
  clear: 'rgba(255,255,255,0)',
  accentTint: 'rgba(138,90,0,0.14)',
  veil: 'rgba(255,255,255,0.88)',
} as const;

const colourDark: Palette = {
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
  facebook: '#1877f2',
  clear: 'rgba(17,17,20,0)',
  accentTint: 'rgba(252,197,34,0.18)',
  veil: 'rgba(17,17,20,0.84)',
};

type Palette = { readonly [K in keyof typeof colour]: string };

export type Role = keyof Palette | 'onFill';

export const light: Record<Role, string> = { ...colour, onFill: colour.text };
export const dark: Record<Role, string> = { ...colourDark, onFill: colour.text };

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const vars = (p: Record<string, string>) => Object.entries(p).map(([k, v]) => `--${kebab(k)}: ${v};`).join(' ');

/** The CSS the page needs: light by default, dark when the system asks for it. */
export function tokenCss(): string {
  return `:root { color-scheme: light dark; ${vars(light)} }\n@media (prefers-color-scheme: dark) { :root { ${vars(dark)} } }`;
}

export function applyTokens(doc: Document = document): void {
  let el = doc.getElementById('sm-tokens');
  if (!el) {
    el = doc.createElement('style');
    el.id = 'sm-tokens';
    doc.head.prepend(el);
  }
  el.textContent = tokenCss();
}

/** For SVG charts, which take colours as values: the palette the page is showing now. */
export function palette(): Record<Role, string> {
  const dark_ = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return dark_ ? dark : light;
}
