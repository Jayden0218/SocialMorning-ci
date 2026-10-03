/**
 * M17 guard G-E2 (FR-010, constitution v3.0.0 "light only"): no dark-mode path is left — no
 * dark palette, no `dark:` class, nothing that reads or sets the phone's colour scheme, no
 * scoped dark theme, and only a light set of variables in global.css.
 *
 * The break that turns it red: add one `dark:bg-text` class to any className in app/ or src/.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });

const FORBIDDEN: [string, RegExp][] = [
  ['a dark palette', /\bcolourDark\b/],
  ['a dark: class', /\bdark:[a-z[]/],
  ['reading the phone scheme', /\buseColorScheme\b/],
  ['setting the phone scheme', /\bsetColorScheme\b/],
  ['a scoped dark theme', /\bScopedTheme\b/],
  ['the old dark switch', /\bDARK_READY\b|\bPlayerDark\b|\bapplyAppearance\b/],
];

it('G-E2: no dark-mode path in app/ or src/', () => {
  const hits: string[] = [];
  for (const f of [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))]) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return; // a comment may name what was removed
      for (const [what, re] of FORBIDDEN) if (re.test(line)) hits.push(`${f.slice(ROOT.length + 1)}:${i + 1} ${what}`);
    });
  }
  expect(hits).toEqual([]);
});

/**
 * UniWind always builds a `light` and a `dark` theme (it hard-codes both), so global.css carries
 * a `dark` set — and it must be the light set, value for value, so a phone set to Dark still gets
 * the light look. The break: change one colour in the dark set only.
 */
it('G-E2: global.css\'s dark set is an exact copy of the light set', () => {
  const css = readFileSync(join(ROOT, 'global.css'), 'utf8');
  const block = (v: string) => (new RegExp(`@variant ${v} \\{([^}]*)\\}`).exec(css)?.[1] ?? '').trim();
  expect(block('light').length).toBeGreaterThan(100);
  expect(block('dark')).toBe(block('light'));
});
