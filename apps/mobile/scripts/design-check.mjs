#!/usr/bin/env node
// The design ratchet: how many old text sizes the app still draws can only go down.
/**
 * 038 M5 (FR-005): counts, in `app/` and `src/` (tests and `src/design` excluded; comment lines skipped):
 *   oldSizeClasses   `text-micro|xs|meta|body|sm|title|base|lg|hero|display` (the old Tailwind-style size classes)
 *   drawnType        `drawnType.<name>` (a one-off size from src/design/type-px.ts)
 *   rawPulseClasses  `text-pulse-<name>` written in a screen (the size belongs to `<Type step>`; Type.tsx and src/design are exempt)
 *   typedFontSize    `fontSize: <number>` (a number typed into a style)
 * and fails when a count is above `scripts/design-baseline.json`. The baseline is today's counts and only ever lowered
 * (Phase 3 takes every one to 0); a count below its baseline prints a reminder to lower it.
 *
 *   node scripts/design-check.mjs [--root <dir>] [--baseline <file>]     exit 1 and the file:line of each use when a count is up
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const RULES = {
  oldSizeClasses: { re: /(?<![\w-])text-(?:micro|xs|meta|body|sm|title|base|lg|hero|display)(?![\w-])/g, exempt: () => false },
  drawnType: { re: /\bdrawnType\./g, exempt: () => false },
  rawPulseClasses: { re: /(?<![\w-])text-pulse-[a-z]+/g, exempt: (f) => f === 'src/ui/kit/Type.tsx' },
  typedFontSize: { re: /\bfontSize:\s*\d/g, exempt: () => false },
};

const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

/** `files`: [{ file, text }] with `file` relative to the app, `/`-separated. Returns { counts, where }. */
export function countDesign(files) {
  const counts = Object.fromEntries(Object.keys(RULES).map((k) => [k, 0]));
  const where = Object.fromEntries(Object.keys(RULES).map((k) => [k, []]));
  for (const { file, text } of files) {
    if (file.startsWith('src/design/') || /\.test\.[tj]sx?$/.test(file) || file.includes('/__tests__/')) continue;
    text.split('\n').forEach((line, i) => {
      if (isComment(line)) return;
      for (const [k, { re, exempt }] of Object.entries(RULES)) {
        if (exempt(file)) continue;
        const n = (line.match(re) ?? []).length;
        if (n) { counts[k] += n; where[k].push(`${file}:${i + 1}`); }
      }
    });
  }
  return { counts, where };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); continue; }
    if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

export function scan(root) {
  const files = ['app', 'src'].flatMap((r) => { try { return walk(path.join(root, r)); } catch { return []; } })
    .map((f) => ({ file: path.relative(root, f).split(path.sep).join('/'), text: readFileSync(f, 'utf8') }));
  return countDesign(files);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
  const root = arg('--root', MOBILE);
  const baseline = JSON.parse(readFileSync(arg('--baseline', path.join(MOBILE, 'scripts', 'design-baseline.json')), 'utf8'));
  const { counts, where } = scan(root);
  let failed = false;
  for (const k of Object.keys(RULES)) {
    const base = baseline[k];
    if (typeof base !== 'number') { console.error(`design-check: baseline has no number for ${k}`); process.exit(2); }
    if (counts[k] > base) {
      failed = true;
      console.error(`design-check: ${k}: ${counts[k]} > baseline ${base}\n  ${where[k].slice(0, 30).join('\n  ')}`);
    } else if (counts[k] < base) {
      console.log(`design-check: ${k}: ${counts[k]} < baseline ${base} — lower scripts/design-baseline.json`);
    } else console.log(`design-check: ${k}: ${counts[k]} = baseline`);
  }
  process.exit(failed ? 1 : 0);
}
