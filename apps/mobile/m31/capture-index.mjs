#!/usr/bin/env node
// M31 (lane CAP6, part D): an INDEX of every m27 inventory entry (apps/mobile/m27/inventory/*.json) -> the contact folder and the picture that shows it,
// or "NOT CAPTURED: <reason>". Generated, never typed: it reads the folders' *-build.png names, maps each capture name to its drawing entry id
// through the DESIGNS tables of scripts/capture-web.mjs (waves 1b-5b, 6) and reads the "not captured" reasons from the lists in capture-w5.mjs /
// capture-w6.mjs and from the folders' READMEs. No picture is copied.
// Usage: node m31/capture-index.mjs [--out ../../specs/033-m31-redesign/contact/all/README.md]
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGNS } from '../scripts/capture-web.mjs';
import { NATIVE_W5 } from './capture-w5.mjs';
import { NATIVE_W6 } from './capture-w6.mjs';
import { KIT } from './capture-w7.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const INV = path.resolve(here, '../m27/inventory');
const CONTACT = path.resolve(here, '../../../specs/033-m31-redesign/contact');
const argv = process.argv.slice(2);
const out = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(CONTACT, 'all/README.md'));
const FOLDERS = ['wave-1b', 'wave-2', 'wave-3', 'wave-4', 'wave-5', 'wave-5b', 'wave-6', 'wave-7'];

const inventory = readdirSync(INV).filter((f) => f.endsWith('.json')).sort().flatMap((f) => JSON.parse(readFileSync(path.join(INV, f), 'utf8')).map((e) => ({ ...e, file: f.replace('.json', '') })));
const DRAWN = new Set(['discover', 'listen', 'settings', 'shell', 'social'].flatMap((f) => JSON.parse(readFileSync(path.resolve(here, '../../../specs/033-m31-redesign/design-pulse2/data', `${f}.json`), 'utf8')).map((e) => e.name)));
const entryOf = new Map(DESIGNS.map((d) => [d[0], { id: d[2], phone: d[3] }]));

/** Drawing entries the inventory names differently (the Discover page is `home--screen` there; the drawings' fold A / B and the episode and moment result tabs are variants of Home / Search results). The Launch and Moments-feed drawings have no inventory entry. */
const ALIAS = { 'discover--screen': 'home--screen', 'home--fold-a': 'home--screen', 'home--fold-b': 'home--screen', 'search--results-episodes': 'search--results', 'search--results-moments': 'search--results' };

/** T104: inventory entries that carry another name than their drawing; the picture of the drawing's entry shows them. [inventory name, folder, picture base name, drawing entry]. */
const MAPPED = [['player--more-sheet', 'wave-1b', 'player-more', 'player--screen (second phone: the More sheet)'], ['me--sign-out-dialog', 'wave-5', 'account--sign-out-dialog', 'account--sign-out-dialog'], ['queue--clear-dialog', 'wave-3', 'player-queue-clear', 'player--queue-clear-dialog']];
/** entry id -> [{ folder, picture }] */
const shown = new Map();
for (const folder of FOLDERS) {
  const dir = path.join(CONTACT, folder);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('-build.png'))) {
    const name = f.slice(0, -'-build.png'.length);
    const e0 = entryOf.get(name) ?? { id: name, phone: 0 };
    const e = KIT[name] && folder === 'wave-7' ? { id: name, phone: 0 } : { ...e0, id: ALIAS[e0.id] ?? e0.id };  // T104: a kit-rule entry is its own inventory name (its design column is a kit part, not an entry of that name)
    if (!shown.has(e.id)) shown.set(e.id, []);
    shown.get(e.id).push({ folder, picture: `${name}-build.png`, side: `${name}-side.png`, phone: e.phone, ...(KIT[name] && folder === 'wave-7' ? { kit: `${KIT[name][2]}, ${KIT[name][1]}` } : {}) });
  }
}

for (const [inv, folder, pic, why] of MAPPED) { if (!shown.has(inv) && existsSync(path.join(CONTACT, folder, `${pic}-build.png`))) shown.set(inv, [{ folder, picture: `${pic}-build.png`, side: `${pic}-side.png`, phone: 0, mapped: why }]); }

/** Reasons the READMEs give under "Not captured" (a bullet names its entries in backticks). */
const readmeReason = new Map();
for (const folder of FOLDERS) {
  const f = path.join(CONTACT, folder, 'README.md');
  if (!existsSync(f)) continue;
  const text = readFileSync(f, 'utf8');
  const i = text.search(/^##\s+Not captured/mi);
  if (i < 0) continue;
  const block = text.slice(i).split(/\n##\s/)[0];
  for (const line of block.split('\n').filter((l) => l.startsWith('- '))) {
    for (const m of line.matchAll(/`([a-z0-9-]+--[a-z0-9-]+)`/g)) if (!readmeReason.has(m[1])) readmeReason.set(m[1], `${line.replace(/^- /, '').replace(/`/g, '').slice(0, 220)} (${folder} README)`);
  }
}

const SYSTEM = /system UI|system alert|alert|share sheet|permission|hand-?off|mail|photo|picker|iOS|Android|browser|clipboard|WhatsApp|opens another app|Safari/i;
const reasonFor = (e) => {
  const native = NATIVE_W6[e.name] ?? NATIVE_W5[e.name];
  if (native) return { cat: SYSTEM.test(native) ? 'native-only system UI' : 'fixture limit', why: native };
  if (e.status === 'EXCLUDED') return { cat: 'excluded in the inventory', why: `the inventory excludes it (${e.kind}${e.note ? `; ${e.note}` : ''}) - a route map or a state with no screen of its own` };
  if (e.status === 'NOT_CAPTURABLE') return { cat: SYSTEM.test(e.note ?? '') || e.kind === 'system' || e.kind === 'permission' ? 'native-only system UI' : 'needs a real device', why: `NOT_CAPTURABLE in the inventory${e.note ? `: ${e.note}` : ''}` };
  if (e.kind === 'permission' || e.kind === 'system') return { cat: 'native-only system UI', why: `${e.kind} entry: an operating-system prompt or hand-off, no web page` };
  if (!DRAWN.has(e.name)) return { cat: 'no drawing', why: 'design-pulse2 draws no entry of this name and no equivalent was found by name search (T104, 2026-10-28; candidates: clip--card-menu / clip--menu ~ episode--card-sheet, downloads--item-menu ~ downloads--select-mode, moments-feed--switch-dialog ~ none, the toasts ~ toast--* of the same page); the owner decides: draw it or accept the older look' };
  const r = readmeReason.get(e.name);
  if (r) return { cat: 'fixture limit', why: r };
  const how = e.kind === 'toast' ? 'a toast that needs a failing call or a state the fixture does not stage' : e.kind === 'sheet' || e.kind === 'dialog' || e.kind === 'menu' ? 'a sheet or dialog opened by a gesture (long press / swipe / a state) no wave scripted' : e.kind === 'empty' || e.kind === 'error' || e.kind === 'loading' || e.kind === 'offline' ? 'a state (empty / error / loading) no wave seeded' : 'a screen variant no wave scripted';
  return { cat: 'not reached by a wave', why: `drawn in design-pulse2 but in no wave list: ${how}` };
};

const rows = inventory.map((e) => {
  const s = shown.get(e.name);
  return { e, s, nc: s ? undefined : reasonFor(e) };
});
const captured = rows.filter((r) => r.s);
const not = rows.filter((r) => !r.s);
const byFolder = new Map();
for (const r of captured) for (const x of new Set(r.s.map((y) => y.folder))) byFolder.set(x, (byFolder.get(x) ?? 0) + 1);
const byCat = new Map();
for (const r of not) byCat.set(r.nc.cat, (byCat.get(r.nc.cat) ?? 0) + 1);

const L = [];
L.push('# Contact index: every m27 inventory entry and where its picture is', '');
L.push(`Generated by \`apps/mobile/m31/capture-index.mjs\` (no picture is copied). Source of the entries: \`apps/mobile/m27/inventory/*.json\` (${inventory.length} entries). A picture is named \`<name>-build.png\` (the app's web build), with \`-design.png\`, \`-side.png\` and \`-diff.png\` beside it, in the folder named. Folders: \`wave-1b\` (the six Pulse screens), \`wave-2\` (Discover folds, Search, Comments, Chat, Me), \`wave-3\` (Episode, Queue, Downloads, Clip, Playlists, History, Favourites, Likes), \`wave-4\` (Profile sub-pages, Stickers, Status, Chat thread, Notifications), \`wave-5\` (Settings, sign-in, onboarding, the rest of Discover), \`wave-5b\` (Updates, Subscriptions, Show, Profile, Category, Their likes), \`wave-6\` (Appeal, Creator, Wallet, Gift, Redeem, Scan, the shared states ...).`, '');
L.push('Web build only (Playwright Chromium 390x844 @2x), NOT a device: a captured entry is VERIFIED to open and to be compared on the web build; nothing here says it works on an iPhone.', '');
L.push('## Counts', '');
L.push('| | entries |', '|---|---|');
L.push(`| inventory entries | ${inventory.length} |`);
L.push(`| **captured** (at least one picture) | **${captured.length}** |`);
for (const [f, n] of [...byFolder].sort()) L.push(`| ...of which shown in ${f} | ${n} |`);
L.push(`| **NOT CAPTURED** | **${not.length}** |`);
for (const [c, n] of [...byCat].sort((a, b) => b[1] - a[1])) L.push(`| ...${c} | ${n} |`);
L.push('', 'An entry can be shown in more than one folder (a later wave re-drew it, or two routes show the same drawing); it is counted once above and each folder once in the "of which" rows.', '');
L.push('## Kit rule for the entries design-pulse2 draws no entry for', '');
L.push('Rule (designer of design-pulse2, 2026-10-28): an undrawn sheet, toast, dialog or error that is built only from drawn kit parts (ActionSheet, Toast, Dialog, error block) follows the kit; it needs no drawing of its own. Each such entry is captured in the kit look (build picture) and its design column is the matching kit part that design-pulse2 does draw (index.html has no section named System; the parts are the drawings named below). They count as covered; nothing is compared word by word.', '');
L.push('| entry | kit part | design column (drawn entry) | picture |', '|---|---|---|---|');
for (const [n, k] of Object.entries(KIT).filter(([, k]) => k[2] !== 'Bars')) L.push(`| \`${n}\` | ${k[2]} | \`${k[1]}\` (${k[0]}) | \`wave-7/${n}-build.png\` |`);
L.push('');
L.push('## NOT CAPTURED, with the reason', '', '| entry | kind | category | reason |', '|---|---|---|---|');
for (const r of not.sort((a, b) => a.nc.cat.localeCompare(b.nc.cat) || a.e.name.localeCompare(b.e.name))) L.push(`| \`${r.e.name}\` | ${r.e.kind} | ${r.nc.cat} | ${r.nc.why.replace(/\|/g, '/')} |`);
L.push('', '## Every entry', '', '| entry | area | kind | where | picture |', '|---|---|---|---|---|');
for (const r of rows) {
  if (r.s) L.push(`| \`${r.e.name}\` | ${r.e.area ?? r.e.file} | ${r.e.kind} | ${[...new Set(r.s.map((x) => x.folder))].join(', ')} | ${r.s.map((x) => `\`${x.folder}/${x.picture}\`${x.phone ? ` (phone ${x.phone + 1})` : ''}${x.kit ? (/^Bars/.test(x.kit) ? ' (design column = the bars drawing, index.html section 2)' : ` (kit rule: design column = ${x.kit})`) : ''}`).join('<br>')} |`);
  else L.push(`| \`${r.e.name}\` | ${r.e.area ?? r.e.file} | ${r.e.kind} | **NOT CAPTURED** | ${r.nc.cat}: ${r.nc.why.replace(/\|/g, '/').slice(0, 160)} |`);
}
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, L.join('\n') + '\n');
console.log(`captured ${captured.length} of ${inventory.length}; not captured ${not.length}: ${[...byCat].map(([c, n]) => `${c} ${n}`).join(', ')}`);
