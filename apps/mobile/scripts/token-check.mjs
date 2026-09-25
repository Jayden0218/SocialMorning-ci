#!/usr/bin/env node
/**
 * M7 FR-002 / guard G1: a colour is written down once, in `src/design/tokens.ts`.
 *
 * Before M7 there were 188 colour literals across 50 files; a restyle only holds if new
 * ones cannot creep back. This fails the gate on any `#rgb`, `#rrggbb` or `rgba(...)`
 * outside the token file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'src'];
const ALLOWED = path.join('src', 'design', 'tokens.ts');
// The contrast module names the dropped colours on purpose, to prove they would fail.
const EXEMPT = [path.join('src', 'design', 'contrast.ts')];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p); continue; }
    if (/\.(tsx?|jsx?)$/.test(p)) files.push(p);
  }
};
for (const r of ROOTS) walk(r);

const COLOUR = /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b|rgba?\(\s*\d/g;
const findings = [];
for (const file of files) {
  if (file === ALLOWED || EXEMPT.includes(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].trim();
    if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) continue;
    const hits = lines[i].match(COLOUR);
    if (hits) findings.push(`${file}:${i + 1} ${hits.join(' ')}`);
  }
}


/**
 * The second class, added 2026-09-25 after the phone showed it.
 *
 * A literal is not the only way to get a colour wrong: a text style with **no `color` at
 * all** falls back to React Native's default, which is black. On a white app that was
 * invisible; on M7's black one every such title rendered black-on-black. The token check
 * was green throughout — there was no literal to find — and the Library's episode titles
 * were simply not readable on build 20.
 *
 * So: any style that sets fontSize, fontWeight, fontVariant or lineHeight must also say
 * what colour it is.
 */
const uncoloured = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s+([A-Za-z0-9_]+): \{([^}]*)\},?\s*$/.exec(lines[i]);
    if (!m) continue;
    const body = m[2];
    if (!/(fontSize|fontWeight|fontVariant|lineHeight)/.test(body)) continue;
    if (/\bcolor:/.test(body)) continue;
    uncoloured.push(`${file}:${i + 1} \`${m[1]}\` sets type but no colour — it would fall back to black`);
  }
}

if (findings.length > 0 || uncoloured.length > 0) {
  if (findings.length > 0) {
    console.error(`token check: ${findings.length} colour literal(s) outside ${ALLOWED}`);
    for (const f of findings) console.error('  ' + f);
  }
  if (uncoloured.length > 0) {
    console.error(`token check: ${uncoloured.length} text style(s) with no colour`);
    for (const f of uncoloured) console.error('  ' + f);
  }
  process.exit(1);
}
console.log(
  `token check: every colour in ${files.length} files comes from ${ALLOWED}, ` +
    'and every text style says what colour it is',
);
