#!/usr/bin/env node
/**
 * M9 (FR-004): `src/design/tokens.ts` stays the only place a colour, size, space or radius
 * is written. This writes them into `global.css` — between the GENERATED markers — as the
 * Tailwind v4 theme UniWind compiles.
 *
 *   node scripts/tokens-to-css.mjs          # rewrite global.css
 *   node scripts/tokens-to-css.mjs --check  # exit 1 if global.css is out of date (guard G4)
 *
 * `renderBlock()` is exported so `__tests__/theme-sync.test.ts` can compare in memory.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const CSS = path.join(ROOT, 'global.css');
export const BEGIN = '/* BEGIN GENERATED FROM src/design/tokens.ts — do not edit; run node scripts/tokens-to-css.mjs */';
export const END = '/* END GENERATED */';

/** Loads tokens.ts without a build step: TypeScript's own transpiler, then a CommonJS eval. */
export function loadTokens() {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const src = readFileSync(path.join(ROOT, 'src/design/tokens.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', js)(module, module.exports, require);
  return module.exports;
}

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** A token colour as CSS: `#rrggbb` as is, `rgba(r,g,b,a)` normalised to `rgba(r, g, b, a)`. */
export function css(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgba) return rgba[4] === undefined ? `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})` : `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${rgba[4]})`;
  throw new Error(`tokens-to-css: cannot read colour ${value}`);
}

/** `#rrggbb` → `r g b`; `rgba(r,g,b,a)` → `r g b / a` — the channel form gluestack's vars use. */
export function channels(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgba) return `${rgba[1]} ${rgba[2]} ${rgba[3]}${rgba[4] !== undefined ? ` / ${rgba[4]}` : ''}`;
  throw new Error(`tokens-to-css: cannot read colour ${value}`);
}

/**
 * gluestack's own colour names (shadcn-style: foreground, card, popover, destructive…) are
 * not defined here: the copied files are rewritten to use these token names instead, because
 * two of them (accent, muted) already mean something else in this app (data-model §1).
 */
export function renderBlock(tokens = loadTokens()) {
  const { colour, fontSize, spacing, radius, size } = tokens;
  const lines = [BEGIN];
  // M17 (constitution v3.0.0): light only — one UniWind theme. (M10b had a `dark` variant too.)
  lines.push('@layer theme {', '  :root {');
  for (const [name, palette] of [['light', colour]]) {
    lines.push(`    @variant ${name} {`);
    // M12 (found on the iPhone 2026-09-29): the documented UniWind form — the real colour, hex
    // or rgba(), under its --color- name (docs.uniwind.dev/theming/global-css). The earlier
    // `--x: r g b / a` + `rgb(var(--x))` lost every alpha: separators drew as solid black
    // lines, and a 14 % tint drew nothing.
    for (const k of Object.keys(colour)) lines.push(`      --color-${k}: ${css(palette[k])};`);
    lines.push('    }');
  }
  lines.push('  }', '}');
  // Tailwind's own palette stays off, as `colors` replaced it in v3: `bg-red-500` generates nothing.
  // The token names are registered in a plain (not inline) @theme, so each utility reads the
  // variable at run time and an accent theme (`Uniwind.updateCSSVariables`) can replace it.
  lines.push('@theme {', '  --color-*: initial;', '  --color-transparent: transparent;');
  for (const k of Object.keys(colour)) lines.push(`  --color-${k}: ${css(colour[k])};`);
  lines.push('}');
  lines.push('@theme inline {');
  // Font sizes REPLACE the default scale, as in v3; no line-height is set, as in v3.
  lines.push('  --text-*: initial;');
  for (const [k, v] of Object.entries(fontSize)) lines.push(`  --text-${k}: ${v}px;`);
  // gluestack's size props ask for 2xs…6xl; M7's type scale has four steps, so the extra
  // names land on the nearest one instead of silently falling back to the default size.
  const alias = { '2xs': 'xs', md: 'base', xl: 'lg', '2xl': 'lg', '3xl': 'lg', '4xl': 'lg', '5xl': 'lg', '6xl': 'lg' };
  for (const [k, to] of Object.entries(alias)) lines.push(`  --text-${k}: ${fontSize[to]}px;`);
  lines.push(`  --spacing-screen-x: ${spacing.screenX}px;`, `  --spacing-row: ${spacing.row}px;`, `  --spacing-gap: ${spacing.gap}px;`, `  --spacing-section: ${spacing.section}px;`);
  // M12 FR-050: `min-h-row-h` — a list row's height (not `row`, which is the 12 pt padding).
  if (size) lines.push(`  --spacing-row-h: ${size.row}px;`);
  lines.push(`  --radius-row: ${radius.row}px;`, `  --radius-artwork: ${radius.artwork}px;`, `  --radius-pill: ${radius.pill}px;`);
  if (radius.artworkLarge) lines.push(`  --radius-artwork-lg: ${radius.artworkLarge}px;`);
  lines.push('}');
  // `StyleSheet.hairlineWidth` as utilities (v3 had `borderWidth.hairline` in the config).
  for (const [cls, prop] of [['border-hairline', 'border-width'], ['border-t-hairline', 'border-top-width'], ['border-b-hairline', 'border-bottom-width'], ['border-l-hairline', 'border-left-width'], ['border-r-hairline', 'border-right-width']]) {
    lines.push(`@utility ${cls} {`, `  ${prop}: hairlineWidth();`, '}');
  }
  lines.push(END);
  return lines.join('\n');
}

export function currentBlock(css = readFileSync(CSS, 'utf8')) {
  const a = css.indexOf(BEGIN);
  const b = css.indexOf(END);
  return a < 0 || b < 0 ? null : css.slice(a, b + END.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const block = renderBlock();
  const css = readFileSync(CSS, 'utf8');
  const cur = currentBlock(css);
  if (process.argv.includes('--check')) {
    if (cur !== block) { console.error('global.css is out of date with src/design/tokens.ts — run node scripts/tokens-to-css.mjs'); process.exit(1); }
    console.log('global.css matches tokens.ts');
  } else {
    writeFileSync(CSS, cur === null ? `${css.trimEnd()}\n\n${block}\n` : css.replace(cur, block));
    console.log('global.css regenerated');
  }
}
