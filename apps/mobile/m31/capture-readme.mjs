// Lane C34: builds the per-screen table of a wave README from measure.md (counts, largest deltas, words not found) and capture-notes-wN.json (hand-written reasons).
// Usage: node m31/capture-readme.mjs <measure.md> <notes.json> > table.md
import { readFileSync } from 'node:fs';
const [measurePath, notesPath] = process.argv.slice(2);
const md = readFileSync(measurePath, 'utf8');
const notes = JSON.parse(readFileSync(notesPath, 'utf8'));
const sections = md.split(/\n### /).slice(1);
const rows = [];
let M = 0, W = 0, N = 0;
const clip = (t, n = 26) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
for (const sec of sections) {
  const name = sec.split('\n')[0].trim();
  const lines = sec.split('\n').filter((l) => /^\| /.test(l) && !/^\| (element|text|---)/.test(l)).map((l) => l.split('|').map((c) => c.trim()).slice(1, -1));
  const status = lines.map((c) => c[c.length - 1]);
  const measured = lines.length, within = status.filter((s) => s.startsWith('yes')).length, nf = status.filter((s) => s.startsWith('not found')).length;
  const opened = !/build did not open/.test(sec);
  M += measured; W += within; N += nf;
  const big = lines.filter((c) => c[c.length - 1] === 'NO').map((c) => ({ w: c[0], d: c[3].split(',').map((v) => parseInt(v, 10)) })).map((r) => ({ ...r, m: Math.max(...r.d.map(Math.abs)) })).sort((a, b) => b.m - a.m).slice(0, 2);
  const missing = lines.filter((c) => c[c.length - 1].startsWith('not found')).slice(0, 3).map((c) => `"${clip(c[0], 22)}"`);
  const auto = [big.length ? `largest: ${big.map((b) => `"${clip(b.w, 20)}" ${b.d.map((v) => (v > 0 ? '+' : '') + v).join('/')}`).join('; ')}` : '', missing.length ? `not found: ${missing.join(', ')}` : ''].filter(Boolean).join('; ');
  rows.push(`| ${name} | ${opened ? measured : 'not opened'} | ${opened ? within : '-'} | ${opened ? nf : '-'} | ${notes[name] ?? '(no note)'}${auto ? ` _[${auto.replace(/\|/g, '/')}]_` : ''} |`);
}
console.log('| screen | measured | within 4 px | not found | remaining differences (one-line reason each; _italic_ = largest measured deltas dx/dy/dw/dh and unmatched words, from measure.md) |\n|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log(`| **all** | **${M}** | **${W}** | **${N}** | |`);
