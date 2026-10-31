#!/usr/bin/env node
// Checks that nothing in app/ or src/ imports a part the redesign retired.
/**
 * M31 T080: the Editorial look left parts behind. Once nothing drew them they were deleted; this keeps them from
 * coming back (an old branch merged in, a copy-paste from an old screen). Two rules, both on `app/` and `src/`
 * (tests excluded; a retired part's own file excluded):
 *   1. RETIRED_PARTS: a module path ending in one of these names is imported nowhere (and the file stays deleted).
 *   2. RETIRED_MODULES: a whole module is not imported (the hand-built gluestack Actionsheet; every sheet is the kit
 *      `ActionSheet` — `src/ui/lib/actionsheet` stays only for its own guard test, `sheet-above-modals`).
 *
 *   node scripts/retired-check.mjs         exit 1 and the file:line of each import
 *
 * The list grows with each retirement; a part leaves it only if it is brought back on purpose (say so in the commit).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Parts retired in the Pulse redesign; each had no importer when it was deleted (T080, 2026-10-28). */
export const RETIRED_PARTS = [
  { name: 'HeatScrubber', file: 'src/ui/player/HeatScrubber.tsx', why: 'the Editorial seek bar; the player draws the kit RingScrubber' },
  { name: 'SheetRow', file: 'src/ui/kit/SheetRow.tsx', why: 'the Editorial sheet row; sheets use the kit ActionSheet tiles (PulseTile) and EpisodeRowSheet' },
  { name: 'TintedPage', file: 'src/ui/kit/TintedPage.tsx', why: 'the Editorial tinted episode page; Pulse pages draw PageGlow' },
];

/** Whole modules no screen may import any more. */
export const RETIRED_MODULES = [
  { module: '@/ui/lib/actionsheet', why: 'hand-built Actionsheets moved onto the kit ActionSheet (T080)' },
];

/**
 * T101 (converge round 1, G17 / G28): Editorial leftovers that are not modules. `re` is read per line
 * (comments skipped) in `only` (one file) or, with no `only`, in every app/ and src/ file outside the
 * vendored `src/ui/lib/`. Deleted with zero callers; they stay deleted.
 */
export const RETIRED_PATTERNS = [
  { name: 'Segmented LOOK map (yellow / dark)', re: /\bLOOK\b/, only: 'src/ui/kit/Segmented.tsx', why: 'Segmented has one look (the Pulse track); the Editorial beige and dark tones had 0 callers' },
  { name: 'Segmented tone prop', re: /<Segmented\b[^>]*\btone=/, why: 'Segmented has no tone; the Editorial dark form is gone' },
  { name: 'text-lead (15 px)', re: /(?:^|[^\w-])text-lead(?![\w-])/, why: 'the old size name `lead` had 0 uses and was deleted (use text-pulse-row / text-pulse-body)' },
  { name: 'text-md (20 px)', re: /(?:^|[^\w-])text-md(?![\w-])/, why: 'the old size name `md` had 0 uses and was deleted (use text-pulse-heading)' },
  { name: 'fontSize.lead', re: /\blead:\s*15\b/, only: 'src/design/tokens.ts', why: 'the old size `lead` was deleted from the font sizes' },
];

const IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); continue; }
    if (/\.(tsx?|jsx?)$/.test(p)) out.push(p);
  }
  return out;
}

/** Pure: `files` is [{ file, text }] (paths relative to apps/mobile). Returns the findings, each a string. */
export function findRetired(files, parts = RETIRED_PARTS, modules = RETIRED_MODULES, patterns = RETIRED_PATTERNS) {
  const out = [];
  for (const { file, text } of files) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const bare = line.trim();
      if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) return;
      for (const p of patterns) {
        if (p.only ? file === p.only : !file.startsWith('src/ui/lib/')) if (p.re.test(line)) out.push(`${file}:${i + 1} uses retired ${p.name} (${p.why})`);
      }
      for (const m of line.matchAll(IMPORT)) {
        const spec = m[1];
        const last = spec.split('/').pop();
        for (const p of parts) {
          if (last === p.name && file !== p.file) out.push(`${file}:${i + 1} imports retired ${p.name} (${p.why})`);
        }
        for (const r of modules) {
          if ((spec === r.module || spec.startsWith(`${r.module}/`)) && !file.startsWith(r.module.replace('@/', 'src/'))) out.push(`${file}:${i + 1} imports retired ${r.module} (${r.why})`);
        }
      }
    });
  }
  return out;
}

/** The retired files must stay deleted. */
export function revived(root = MOBILE, parts = RETIRED_PARTS) {
  return parts.filter((p) => existsSync(path.join(root, p.file))).map((p) => `${p.file} is back (retired: ${p.why})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = ['app', 'src'].flatMap((r) => walk(path.join(MOBILE, r))).map((f) => ({ file: path.relative(MOBILE, f).split(path.sep).join('/'), text: readFileSync(f, 'utf8') }));
  const findings = [...findRetired(files), ...revived()];
  if (findings.length) {
    console.error(`retired-check: ${findings.length} retired part(s) in use`);
    for (const f of findings) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`retired-check: ok — ${RETIRED_PARTS.length} parts and ${RETIRED_MODULES.length} module and ${RETIRED_PATTERNS.length} patterns retired, 0 imports in ${files.length} files`);
}
