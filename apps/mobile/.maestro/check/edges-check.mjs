#!/usr/bin/env node
// Fails when a screen's text does not sit on the layout grid: text left of the 20 pt gutter, or more than 4 distinct row-start edges.
/**
 * 039 T020 (US2 acceptance 3, US5). Reads what was DRAWN, like a11y-frames.mjs (same `maestro hierarchy` JSON, same `bounds` form "[x1,y1][x2,y2]").
 *
 * Per screen (`hierarchy/<id>-<slug>-end.json`, e.g. r13-me-end.json, and r13-xl-me-end.json for the large-text run; default flows: every route flow file r*.yaml in this folder, and their `-xl` variants):
 *  - collect visible text nodes: a LEAF node (no labelled descendant) with a non-empty `text`, `accessibilityText` or `value`, whose frame is on the screen;
 *  - skip system chrome (status bar region at the top, clock/battery/signal labels), the tab bar and the now bar (resource-id starting `tab-`, `now-`, or an
 *    ancestor with one; and the bottom 100 pt strip, as the tab bar has no root id), the iOS keyboard (`UIKeyboard*`) and the Dock screen;
 *  - skip a node whose resource-id ends in `-bleed` (a full-bleed element, e.g. a hero image caption: the only way to start left of the gutter);
 *  - round each left edge to the nearest point (pixels are divided by 3 when the screen is wider than 700: iPhones are 375-440 pt, 1125+ px at 3x);
 *  - group the texts into visual ROWS (vertical centres within 8 pt, or frames overlapping by more than half the shorter height); a row starts at its left-most text.
 *    A row whose texts are horizontally centred on the screen (|left gap - right gap| <= 4 pt, left gap >= the gutter: an empty state) is not a row start.
 *    FAIL (a) any row start < 20 pt (the gutter), (b) more than 4 distinct row-start edges (starts within 2 pt are one). Controls side by side in a row are one start.
 *
 * Usage: node edges-check.mjs <check output dir | hierarchy .json file> [--flows r04,r13] [--max-edges 4] [--gutter 20]
 * Prints a per-screen table (a flow with no file is `skipped`: a narrowed run); exits 1 on a finding or when NONE of the listed flows has a hierarchy file, 2 on bad usage.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const [v] = args.splice(i, 2).slice(1); return v; };
// Default: every route flow file in this folder (r01-first-launch.yaml -> r01; the -xl re-runs ride on their id). A flow with no hierarchy file is `skipped`.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALL_FLOWS = [...new Set(readdirSync(HERE).filter((n) => /^r\d+-.*\.yaml$/.test(n)).map((n) => n.split('-')[0]))].sort();
const FLOWS = opt('--flows', ALL_FLOWS.join(',')).split(',').filter(Boolean);
const MAX_EDGES = Number(opt('--max-edges', '4'));
const GUTTER = Number(opt('--gutter', '20'));
const target = args[0];
if (!target || !existsSync(target)) { console.error('usage: edges-check.mjs <check output dir | hierarchy.json> [--flows r04,r13] [--max-edges 4] [--gutter 20]'); process.exit(2); }

// A flow's file is `hierarchy/<id>-<slug>-end.json` (r13-me-end.json; the large-text run r13-xl-me-end.json) or, for a bare id, `<id>-end.json`.
const dirFiles = statSync(target).isDirectory() && existsSync(path.join(target, 'hierarchy')) ? readdirSync(path.join(target, 'hierarchy')) : [];
const isEnd = (n) => n.endsWith('-end.json');
const findFlow = (id) => dirFiles.filter((n) => isEnd(n) && (n === `${id}-end.json` || (n.startsWith(`${id}-`) && !n.startsWith(`${id}-xl-`) && n !== `${id}-xl-end.json`))).sort();
const findXl = (id) => dirFiles.filter((n) => isEnd(n) && n.startsWith(`${id}-xl-`) || n === `${id}-xl-end.json`).sort();
const notRun = [];
const files = statSync(target).isDirectory()
  ? FLOWS.flatMap((f) => {
      const found = [...findFlow(f), ...findXl(f)].filter((n) => dirFiles.includes(n));
      if (found.length === 0) notRun.push(f);
      return found.map((n) => path.join(target, 'hierarchy', n));
    })
  : [target];

const bbox = (b) => { const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(b ?? ''); return m ? m.slice(1).map(Number) : undefined; };
const CHROME = /scroll bar|battery|^Cellular$|Wi-Fi|^\d{1,2}:\d{2}\s?[AP]M$|^Dock$|^Typing Predictions$/u;
const labelOf = (n) => {
  const a = n.attributes ?? {};
  if (/scroll bar/i.test(String(a.accessibilityText ?? ''))) return ''; // its text is the scroll position ("0%"), not words
  return [a.text, a.accessibilityText, a.value].map((s) => String(s ?? '').trim()).find((s) => s !== '') ?? '';
};
const hasLabelBelow = (n) => (n.children ?? []).some((c) => labelOf(c) !== '' || hasLabelBelow(c));
// The iOS keyboard has no resource-id on its keys: its containers do (UIKeyboardLayoutStar..., the prediction bar SystemInputAssistantView / CenterPageView).
const skipId = (id) => id.startsWith('tab-') || id.startsWith('now-') || id.startsWith('UIKeyboard') || id === 'SystemInputAssistantView' || id === 'CenterPageView';
const KEYBOARD_LABEL = /^Typing Predictions$/u;

export function analyse(tree, { gutter = GUTTER, maxEdges = MAX_EDGES } = {}) {
  // The real tree's own root is [0,0][0,0]: the screen is the first frame with an area.
  const area = (b) => b && b[2] > b[0] && b[3] > b[1];
  const firstFrame = (n) => { const b = bbox(n.attributes?.bounds); if (area(b)) return b; for (const c of n.children ?? []) { const f = firstFrame(c); if (f) return f; } return undefined; };
  const root = firstFrame(tree) ?? [0, 0, 390, 844];
  const k = root[2] - root[0] > 700 ? 3 : 1; // pixels -> points
  const W = (root[2] - root[0]) / k, H = (root[3] - root[1]) / k;
  const texts = [];
  let dock = false;
  (function visit(n, skipped) {
    const id = String(n.attributes?.['resource-id'] ?? '');
    const label = labelOf(n);
    const skip = skipped || skipId(id) || KEYBOARD_LABEL.test(label);
    if (label === 'Dock') dock = true;
    const b = bbox(n.attributes?.bounds);
    if (!skip && label !== '' && !hasLabelBelow(n) && b && !CHROME.test(label)) {
      const [x1, y1, x2, y2] = b.map((v) => v / k);
      const onScreen = x2 > 0 && x1 < W && y2 > 0 && y1 < H && x2 > x1 && y2 > y1;
      const chromeBand = y1 < 50 || y1 >= H - 100; // status bar; tab bar / now bar / home indicator
      if (onScreen && !chromeBand) texts.push({ label, x: Math.round(x1), x2: Math.round(x2), y: Math.round(y1), y2: Math.round(y2), bleed: id.endsWith('-bleed') });
    }
    for (const c of n.children ?? []) visit(c, skip);
  })(tree, false);
  if (dock) return { texts: [], edges: [], findings: [], skipped: 'home screen (Dock)' };
  // Rows: texts whose vertical centres are within 8 pt, or whose frames overlap by more than half the shorter height, are one visual row. A row starts at
  // its left-most text; side-by-side controls (two buttons, a tile pair, wrapped pills) are one row start, not several edges. Bleed elements are exempt.
  const sameRow = (a, b) => {
    const ca = (a.y + a.y2) / 2, cb = (b.y + b.y2) / 2;
    const overlap = Math.min(a.y2, b.y2) - Math.max(a.y, b.y);
    return Math.abs(ca - cb) <= 8 || overlap > Math.min(a.y2 - a.y, b.y2 - b.y) / 2;
  };
  const rows = [];
  for (const t of texts.filter((t) => !t.bleed).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((r) => r.some((m) => sameRow(m, t)));
    if (row) row.push(t); else rows.push([t]);
  }
  // A row whose texts are centred on the screen (an empty state: a line and a button in the middle) has no left edge to be on a grid; it is not a row start.
  // A row that starts left of the gutter is still a finding, centred or not.
  const centred = (r) => { const l = Math.min(...r.map((t) => t.x)), rt = Math.max(...r.map((t) => t.x2)); return l >= gutter && Math.abs(l - (W - rt)) <= 4; };
  const starts = rows.filter((r) => !centred(r)).map((r) => r.reduce((m, t) => (t.x < m.x ? t : m)));
  const left = starts.filter((t) => t.x < gutter);
  const xs = [...new Set(starts.map((t) => t.x))].sort((a, b) => a - b);
  const edges = [];
  for (const x of xs) {
    const n = starts.filter((t) => t.x === x).length;
    const last = edges[edges.length - 1];
    if (last && x - last.max <= 2) { last.max = x; last.n += n; } else edges.push({ min: x, max: x, n });
  }
  const findings = left.map((t) => `"${t.label.slice(0, 40)}" starts at ${t.x} pt (gutter ${gutter})`);
  if (edges.length > maxEdges) findings.push(`${edges.length} distinct row-start edges (at most ${maxEdges}): ${edges.map((e) => e.min).join(', ')} pt`);
  return { texts, edges, findings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (files.length === 0) { console.error(`edges check: no hierarchy file for ${FLOWS.join(', ')} (and -xl) under ${target}`); process.exit(1); }
  let bad = 0, parsed = 0;
  console.log('screen\ttexts\tedges (pt: count)\tverdict');
  for (const f of notRun) console.log(`${f}\t-\tnot run in this check\tskipped`);
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
