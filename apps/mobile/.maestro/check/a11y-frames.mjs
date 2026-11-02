#!/usr/bin/env node
// Fails when a labelled control that holds an icon is smaller than 44 x 44 pt on the screens the device check saw.
/**
 * 035 T062 (device check A3; FR-015; SC-003). The static audit (scripts/a11y-audit.mjs) reads what is written; this reads what was
 * DRAWN: every `hierarchy/<flow>-end.json` and every `maestro/<flow>/<date>/<flow>/screen-hierarchy/*.json` that Maestro wrote. An
 * element with an accessibility name (`accessibilityText`) that contains an `icon-*` element (the kit's icons carry that
 * resource-id) must have a frame of at least 44 x 44 pt (Apple's minimum; `hitSlop` does not count: it is not in the frame).
 *
 * Usage: node a11y-frames.mjs <check output dir>     → prints one line per finding, exits 1 when there is one (or no hierarchy at all).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const MIN = 44;
const root = process.argv[2];
if (!root || !existsSync(root)) { console.error('usage: a11y-frames.mjs <check output dir>'); process.exit(2); }

const jsons = [];
const walk = (dir, under) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, under || name === 'screen-hierarchy'); continue; }
    if (!name.endsWith('.json')) continue;
    if (name.endsWith('-end.json') || under) jsons.push(p);
  }
};
walk(root, false);

const frame = (b) => {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(b ?? '');
  return m ? { w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) } : undefined;
};
const hasIcon = (n) => String(n.attributes?.['resource-id'] ?? '').startsWith('icon-') || (n.children ?? []).some(hasIcon);

const findings = [];
let parsed = 0;
for (const file of jsons) {
  let tree;
  try { tree = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
  parsed++;
  const seen = new Set();
  // iOS repeats a control's name on an inner node (a 40 pt disc inside its 48 pt Pressable): only the outermost node of a name is judged.
  const visit = (n, parentLabel = '') => {
    const a = n.attributes ?? {};
    const label = String(a.accessibilityText ?? '').trim();
    const f = frame(a.bounds);
    if (label !== '' && label !== parentLabel && f && f.w > 0 && f.h > 0 && (f.w < MIN || f.h < MIN) && hasIcon(n)) {
      const key = `${label}|${a.bounds}`;
      if (!seen.has(key)) { seen.add(key); findings.push(`${path.relative(root, file)}: "${label}" is ${f.w} x ${f.h} pt (at least ${MIN} x ${MIN})`); }
    }
    for (const c of n.children ?? []) visit(c, label !== '' ? label : parentLabel);
  };
  visit(tree);
}
if (parsed === 0) { console.error('a11y frames: no hierarchy file was read'); process.exit(1); }
if (findings.length > 0) {
  console.error(`a11y frames: ${findings.length} control(s) under ${MIN} x ${MIN} pt in ${parsed} screen(s)`);
  for (const f of findings) console.error('  ' + f);
  process.exit(1);
}
console.log(`a11y frames: every labelled icon control in ${parsed} screen(s) is at least ${MIN} x ${MIN} pt`);
