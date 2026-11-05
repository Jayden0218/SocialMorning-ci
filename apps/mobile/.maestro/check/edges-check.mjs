#!/usr/bin/env node
// Fails when a screen's text does not sit on the layout grid: text left of the 20 pt gutter, or more than 4 distinct left edges.
/**
 * 039 T020 (US2 acceptance 3, US5). Reads what was DRAWN, like a11y-frames.mjs (same `maestro hierarchy` JSON, same `bounds` form "[x1,y1][x2,y2]").
 *
 * Per screen (`hierarchy/<flow>-end.json`; default flows r04, r13, r15 and their `-xl` variants):
 *  - collect visible text nodes: a LEAF node (no labelled descendant) with a non-empty `text`, `accessibilityText` or `value`, whose frame is on the screen;
 *  - skip system chrome (status bar region at the top, clock/battery/signal labels), the tab bar and the now bar (resource-id starting `tab-`, `now-`, or an
 *    ancestor with one; and the bottom 100 pt strip, as the tab bar has no root id), the iOS keyboard (`UIKeyboard*`) and the Dock screen;
 *  - skip a node whose resource-id ends in `-bleed` (a full-bleed element, e.g. a hero image caption: the only way to start left of the gutter);
 *  - round each left edge to the nearest point (pixels are divided by 3 when the screen is wider than 700: iPhones are 375-440 pt, 1125+ px at 3x);
 *  - FAIL (a) any text edge < 20 pt (the gutter), (b) more than 4 distinct left edges (edges within 2 pt are one).
 *
 * Usage: node edges-check.mjs <check output dir | hierarchy .json file> [--flows r04,r13,r15] [--max-edges 4] [--gutter 20]
 * Prints a per-screen table; exits 1 on a finding or when no listed hierarchy exists, 2 on bad usage.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const [v] = args.splice(i, 2).slice(1); return v; };
const FLOWS = opt('--flows', 'r04,r13,r15').split(',').filter(Boolean);
const MAX_EDGES = Number(opt('--max-edges', '4'));
const GUTTER = Number(opt('--gutter', '20'));
const target = args[0];
if (!target || !existsSync(target)) { console.error('usage: edges-check.mjs <check output dir | hierarchy.json> [--flows r04,r13,r15] [--max-edges 4] [--gutter 20]'); process.exit(2); }

const files = statSync(target).isDirectory()
  ? FLOWS.flatMap((f) => [f, `${f}-xl`]).map((f) => path.join(target, 'hierarchy', `${f}-end.json`)).filter((p) => existsSync(p))
  : [target];

const bbox = (b) => { const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(b ?? ''); return m ? m.slice(1).map(Number) : undefined; };
const CHROME = /scroll bar|battery|^Cellular$|Wi-Fi|^\d{1,2}:\d{2}\s?[AP]M$|^Dock$/u;
const labelOf = (n) => {
  const a = n.attributes ?? {};
  return [a.text, a.accessibilityText, a.value].map((s) => String(s ?? '').trim()).find((s) => s !== '') ?? '';
};
const hasLabelBelow = (n) => (n.children ?? []).some((c) => labelOf(c) !== '' || hasLabelBelow(c));
const skipId = (id) => id.startsWith('tab-') || id.startsWith('now-') || id.startsWith('UIKeyboard');

export function analyse(tree, { gutter = GUTTER, maxEdges = MAX_EDGES } = {}) {
  const root = bbox(tree.attributes?.bounds) ?? [0, 0, 390, 844];
  const k = root[2] - root[0] > 700 ? 3 : 1; // pixels -> points
  const W = (root[2] - root[0]) / k, H = (root[3] - root[1]) / k;
  const texts = [];
  let dock = false;
  (function visit(n, skipped) {
    const id = String(n.attributes?.['resource-id'] ?? '');
    const skip = skipped || skipId(id);
    const label = labelOf(n);
    if (label === 'Dock') dock = true;
    const b = bbox(n.attributes?.bounds);
    if (!skip && label !== '' && !hasLabelBelow(n) && b && !CHROME.test(label)) {
      const [x1, y1, x2, y2] = b.map((v) => v / k);
      const onScreen = x2 > 0 && x1 < W && y2 > 0 && y1 < H && x2 > x1 && y2 > y1;
      const chromeBand = y1 < 50 || y1 >= H - 100; // status bar; tab bar / now bar / home indicator
      if (onScreen && !chromeBand) texts.push({ label, x: Math.round(x1), y: Math.round(y1), bleed: id.endsWith('-bleed') });
    }
    for (const c of n.children ?? []) visit(c, skip);
  })(tree, false);
  if (dock) return { texts: [], edges: [], findings: [], skipped: 'home screen (Dock)' };
  const left = texts.filter((t) => t.x < gutter && !t.bleed);
  // cluster edges within 2 pt (bleed elements are exempt from both rules)
  const xs = [...new Set(texts.filter((t) => !t.bleed).map((t) => t.x))].sort((a, b) => a - b);
  const edges = [];
  for (const x of xs) {
    const last = edges[edges.length - 1];
    if (last && x - last.max <= 2) { last.max = x; last.n += texts.filter((t) => !t.bleed && t.x === x).length; }
    else edges.push({ min: x, max: x, n: texts.filter((t) => !t.bleed && t.x === x).length });
  }
  const findings = left.map((t) => `"${t.label.slice(0, 40)}" starts at ${t.x} pt (gutter ${gutter})`);
  if (edges.length > maxEdges) findings.push(`${edges.length} distinct left edges (at most ${maxEdges}): ${edges.map((e) => e.min).join(', ')} pt`);
  return { texts, edges, findings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (files.length === 0) { console.error(`edges check: no hierarchy file for ${FLOWS.join(', ')} (and -xl) under ${target}`); process.exit(1); }
  let bad = 0, parsed = 0;
  console.log('screen\ttexts\tedges (pt: count)\tverdict');
  for (const file of files) {
    let tree;
    try { tree = JSON.parse(readFileSync(file, 'utf8')); } catch { console.log(`${path.basename(file)}\t-\tunreadable\tFAIL`); bad++; continue; }
    parsed++;
    const r = analyse(tree);
    const name = path.basename(file).replace(/-end\.json$/, '');
    if (r.skipped) { console.log(`${name}\t-\t${r.skipped}\tskipped`); continue; }
    console.log(`${name}\t${r.texts.length}\t${r.edges.map((e) => `${e.min}:${e.n}`).join(' ')}\t${r.findings.length ? 'FAIL' : 'ok'}`);
    for (const f of r.findings) { console.log(`  ${name}: ${f}`); bad++; }
  }
  if (parsed === 0) { console.error('edges check: no hierarchy file was readable'); process.exit(1); }
  if (bad > 0) { console.error(`edges check: ${bad} finding(s) in ${parsed} screen(s)`); process.exit(1); }
  console.log(`edges check: every text edge in ${parsed} screen(s) is on the ${GUTTER} pt gutter grid (at most ${MAX_EDGES} edges)`);
}
