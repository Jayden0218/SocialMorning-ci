// Lane C34: puts re-measured screens (fix files) into a wave's measure.md in place of the older ones, then rewrites the total line.
// Usage: node m31/capture-splice.mjs <base.md> <fix.md>... > merged.md
import { readFileSync } from 'node:fs';
const [base, ...fixes] = process.argv.slice(2);
const split = (f) => readFileSync(f, 'utf8').split(/\n### /).slice(1).map((s) => s.replace(/\n\n?\d+ of \d+ elements within[^\n]*\n?$/, '').replace(/\s+$/, ''));
const nameOf = (s) => s.split('\n')[0].trim();
const secs = split(base);
for (const f of fixes) for (const s of split(f)) { const i = secs.findIndex((x) => nameOf(x) === nameOf(s)); if (i >= 0) secs[i] = s; else secs.push(s); }
let ok = 0, total = 0, missing = 0;
for (const s of secs) for (const l of s.split('\n')) { if (!/^\| /.test(l) || /^\| (element|text|---)/.test(l)) continue; const st = l.split('|').slice(-2, -1)[0].trim(); total++; if (st.startsWith('yes')) ok++; else if (st.startsWith('not found')) missing++; }
console.log('\n' + secs.map((s) => `### ${s}`).join('\n\n'));
console.log(`\n${ok} of ${total} elements within 4 px on all four numbers; ${missing} not found on one side. Web build (Playwright Chromium 390x844), not a device.`);
