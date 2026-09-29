/**
 * The Studio's only colour file (FR-028). Every colour comes from the app's own tokens
 * (`apps/mobile/src/design/tokens.ts`, via the `@tokens` alias), so the website and the app
 * cannot drift. `test/tokens.test.ts` fails if a colour literal appears anywhere else in `src/`.
 *
 * One Studio-only role: `onFill` — words on the yellow fill. The app uses white there under
 * the owner's waiver (1.60); the Studio must meet WCAG AA, so it uses the light palette's text
 * colour on yellow in both themes (measured in the test).
 */
import { colour, colourDark, type Palette } from '@tokens';

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
