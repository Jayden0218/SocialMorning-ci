#!/usr/bin/env node
// Produces a list of every button and link, with name and destination.
/**
 * M17 (FR-007, guard G-E3): the action inventory — every interactive element in app/ and src/
 * with its role, its accessible name and where it goes, so a rebuilt screen can be checked
 * against what it had before. A grep, not a renderer (research R7), built from the a11y audit's
 * element reader and tap-counts' destination matcher. It reads files only.
 *
 *   node scripts/action-inventory.mjs            → JSON on stdout
 *   node scripts/action-inventory.mjs --root <apps/mobile dir> → read another tree
 *   node scripts/action-inventory.mjs --commit X → stamps `commit` (default: git HEAD)
 *
 * Output shape: specs/018-m17-editorial/contracts/action-inventory.schema.json.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `--root <apps/mobile dir>` reads another tree (the baseline is taken from the pre-redesign worktree).
const rootArg = process.argv.indexOf('--root');
const MOBILE = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAGS = 'Pressable|TouchableOpacity|TouchableHighlight|Switch|TextInput|Link|Row|Button|Chip|NavLink|TabBar|ActionsheetItem|Slider|TextareaInput|InputField|Fab|Checkbox|Radio|MenuRow|LinkRow|SheetRow|SheetTile'
  // Review fix (L9): custom tappables the first list missed (the Player's Clip was a BarButton and invisible).
  + '|BarButton|IconButton|PulseButton|AuthButton|AddButton|PlayButton|PickPlay|PickCard|HotNowTile|MenuTile|MoreTile|MinutesTile|CommentsButton|Choice|Entry|Tab|Toggle|SwitchRow|SwitchCard|ConsentRow'
  // M31 T030 (lane W2-A): the Discover deck's own tappables (src/ui/discover/Deck.tsx).
  + '|DeckLink|DiscPlay|RingAdd|PlayGlyph'
  // M31 S-B (T060 part 2): the Settings pages' own tappables (src/ui/settings/panel.tsx).
  + '|QuietPill|BigSwitch|SettingsSegment'
  // M31 S-A (T060 part 1): the Settings hub and pages A–M tappables (src/ui/settings/hub-parts.tsx).
  + '|SetRow|BigTile|SetButton'
  // M31 blind-spot fix: the kit sheet's own tiles and rows (a move into a sheet is now checkable).
  + '|PulseTile|PanelRow|ComposerBar';
const OPEN = new RegExp(`<(${TAGS})\\b`);

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && p !== path.join(MOBILE, 'src', 'ui', 'lib')) walk(p);
      continue;
    }
    if (p.endsWith('.tsx')) files.push(p);
  }
};
for (const r of ['app', 'src']) walk(path.join(MOBILE, r));
files.sort();

/** `app/(tabs)/me.tsx` → `/me`, `app/settings/push.tsx` → `/settings/push`; src files → their base name. */
const surfaceOf = (rel) => {
  if (rel.startsWith('app/')) {
    const r = rel.slice(4).replace(/\.tsx$/, '').replace(/\([^)]*\)\//g, '').replace(/(^|\/)index$/, '');
    return '/' + r;
  }
  return path.basename(rel, '.tsx');
};

const clean = (s) => s.replace(/\s+/g, ' ').trim();
/** The value of a JSX prop: `name="x"`, `name={'x'}`, `name={`x`}` or `name={expr}` (kept as written). */
const prop = (block, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|\\{\\s*'([^']*)'\\s*\\}|\\{\\s*\`([^\`]*)\`\\s*\\}|\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\})`).exec(block);
  if (!m) return undefined;
  return clean(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
};

// `block` is the opening tag only (props); `rest` is the few lines after it, read only for a text child.
// (Review fix L9: props used to be read from `rest` too, so a one-line `<SwitchRow … />` took the name
// of the next element's accessibilityLabel.)
const nameOf = (block, tag, rest = '') => {
  for (const p of ['accessibilityLabel', 'aria-label']) {
    const v = prop(block, p);
    if (v) return v;
  }
  if (tag === 'Row') { const v = prop(block, 'title'); if (v) return v; }
  for (const p of ['label', 'title', 'placeholder']) {
    const v = prop(block, p);
    if (v) return v;
  }
  const text = /<[A-Za-z]*Text\b[^>]*>([^<]+)</.exec(block + rest);
  if (text) return clean(text[1]);
  return '';
};

const destinationOf = (block) => {
  const href = prop(block, 'href');
  if (href) return href;
  // Single or double quotes: a formatter pass (owner, 2026-10-04) writes "…".
  const push = /router\.(push|replace|navigate|back)\(\s*(?:['"]([^'"]*)['"]|`([^`]*)`|\{\s*pathname:\s*['"]([^'"]*)['"]|\))?/.exec(block);
  if (push) return push[1] === 'back' ? 'back' : (push[2] ?? push[3] ?? push[4] ?? 'dynamic');
  for (const p of ['onPress', 'onOpen', 'onValueChange', 'onChangeText', 'onSubmitEditing', 'onLongPress']) {
    const v = prop(block, p);
    if (!v) continue;
    const call = /^\(?[^)]*\)?\s*=>\s*(?:void\s+)?([A-Za-z_$][\w$.]*)\s*\(/.exec(v);
    if (call) return call[1];
    if (/^[A-Za-z_$][\w$.]*$/.test(v)) return v;
    return 'dynamic';
  }
  return 'dynamic';
};

const roleOf = (block, tag) => {
  const r = /accessibilityRole\s*=\s*(?:"([^"]*)"|\{\s*'([^']*)'\s*\})/.exec(block);
  if (r) return r[1] ?? r[2];
  return { Switch: 'switch', Toggle: 'switch', SwitchRow: 'switch', SwitchCard: 'switch', TextInput: 'input', InputField: 'input', TextareaInput: 'input', Slider: 'adjustable',
    Link: 'link', MenuRow: 'link', LinkRow: 'link', Checkbox: 'checkbox', Radio: 'radio', TabBar: 'tablist' }[tag] ?? 'button';
};

/** index of the `}` that closes the `{` at `start` (string/template/comment aware, starts in code); -1 if none. */
const closeOf = (t, start) => {
  let depth = 0;
  for (let k = start; k < t.length; k++) {
    const c = t[k];
    if (c === '"' || c === "'") { for (k++; k < t.length && t[k] !== c && t[k] !== '\n'; k++) if (t[k] === '\\') k++; }
    else if (c === '`') { for (k++; k < t.length && t[k] !== '`'; k++) if (t[k] === '\\') k++; }
    else if (c === '/' && t[k + 1] === '/') { while (k < t.length && t[k] !== '\n') k++; }
    else if (c === '/' && t[k + 1] === '*') { k = t.indexOf('*/', k + 2); if (k < 0) return -1; k++; }
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return k;
  }
  return -1;
};
/** true when the nearest unclosed bracket before `pos` is a `[` (the object sits directly in an array literal). */
const inArray = (t, pos) => {
  let d = 0;
  for (let k = pos - 1; k >= 0 && pos - k < 6000; k--) {
    const c = t[k];
    if (c === ')' || c === ']' || c === '}') d++;
    else if (c === '(' || c === '[' || c === '{') { if (d === 0) return c === '['; d--; }
  }
  return false;
};
/** The value text starting at `from` in `obj`, up to the next top-level comma. */
const valueAt = (obj, from) => {
  let d = 0;
  for (let k = from; k < obj.length; k++) {
    const c = obj[k];
    if (c === '"' || c === "'") { for (k++; k < obj.length && obj[k] !== c; k++) if (obj[k] === '\\') k++; }
    else if (c === '`') { for (k++; k < obj.length && obj[k] !== '`'; k++) if (obj[k] === '\\') k++; }
    else if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) { if (d === 0) return obj.slice(from, k); d--; }
    else if (c === ',' && d === 0) return obj.slice(from, k);
  }
  return obj.slice(from);
};
/** M31 blind-spot fix: actions a screen hands to a kit part as data, `{ label: 'X', onPress: go }` inside an array. */
const arrayActions = (text) => {
  const found = [];
  const re = /[[,]\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length - 1;
    if (!inArray(text, start)) continue;
    const end = closeOf(text, start);
    if (end < 0) continue;
    const obj = text.slice(start + 1, end);
    // keys at the object's own level only
    let d = 0; const keys = [];
    const kre = /([A-Za-z_$][\w$]*)\s*:/g;
    const depthAt = Array.from({ length: obj.length + 1 }, () => 0);
    for (let k = 0; k < obj.length; k++) {
      const c = obj[k];
      if (c === '"' || c === "'") { const q = c; k++; while (k < obj.length && obj[k] !== q) { if (obj[k] === '\\') k++; depthAt[k] = d + 1; k++; } depthAt[k] = d + 1; continue; }
      if (c === '`') { k++; while (k < obj.length && obj[k] !== '`') { if (obj[k] === '\\') k++; depthAt[k] = d + 1; k++; } depthAt[k] = d + 1; continue; }
      if ('([{'.includes(c)) d++;
      depthAt[k] = d;
      if (')]}'.includes(c)) d--;
    }
    let km;
    while ((km = kre.exec(obj))) {
      if (depthAt[km.index] === 0 && !/[\w$.]/.test(obj[km.index - 1] ?? ' ')) keys.push({ key: km[1], at: km.index + km[0].length });
    }
    const get = (k) => { const f = keys.find((x) => x.key === k); return f ? valueAt(obj, f.at).trim() : undefined; };
    const press = get('onPress');
    const label = get('label') ?? get('title');
    if (press === undefined || label === undefined) continue;
    const lit = /^(?:"([^"]*)"|'([^']*)'|`([^`]*)`)$/.exec(label);
    const name = clean(lit ? (lit[1] ?? lit[2] ?? lit[3]) : label);
    if (!name) continue;
    const line = text.slice(0, start).split('\n').length;
    found.push({ line, name, destination: destinationOf(`onPress={${press}}`) });
  }
  return found;
};

/** The opening tag at lines[i] (from column `col`) up to its `>` or `/>`, past arrows and comparisons in props; `rest` is the few lines after. */
const readTag = (lines, i, col) => {
  let block = '';
  let rest = '';
  for (let j = i; j < Math.min(lines.length, i + 40); j++) {
    block += (j === i ? lines[j].slice(col) : lines[j]) + '\n';
    const flat = block.replace(/=>|>=|<=/g, '  ');
    let depth = 0; let end = -1;
    for (let k = 0; k < flat.length; k++) {
      const c = flat[k];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) { end = k; break; }
    }
    if (end >= 0) {
      // Keep the first text child too: some elements are named by it.
      rest = lines.slice(j, j + 6).join('\n');
      block = block.slice(0, end + 1);
      if (block.endsWith('/>')) rest = ''; // self-closing: no children to name it by
      break;
    }
  }
  return { block, rest };
};
// M31 blind-spot fix: the bar actions a page hands to the title bar as props (back, title link, subtitle link).
const PAGE_OPEN = /<(TitleBar|PushedPage|OverlayPage)\b/;
const barProps = (block) => {
  const out = [];
  const val = (n) => { const m = new RegExp(`\\b${n}\\s*=\\s*\\{`).exec(block); return m ? prop(block, n) : undefined; };
  for (const [key, label] of [['onBack', () => prop(block, 'backLabel') || 'Back'], ['onTitle', () => prop(block, 'titleLabel') || prop(block, 'title')], ['onSubtitle', () => prop(block, 'subtitle')]]) {
    const v = val(key);
    if (v === undefined || v === 'null' || v === 'undefined') continue;
    const name = label();
    if (name) out.push({ name, destination: destinationOf(`onPress={${v}}`) });
  }
  return out;
};

const entries = [];
for (const abs of files) {
  const rel = path.relative(MOBILE, abs).split(path.sep).join('/');
  const lines = readFileSync(abs, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].trim();
    if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) continue;
    const open = OPEN.exec(lines[i]);
    if (!open) continue;
    const tag = open[1];
    const { block, rest } = readTag(lines, i, open.index);
    const prev = entries[entries.length - 1];
    const entryName = nameOf(block, tag, rest);
    // `<Link asChild><Pressable …>` is one action: the Link carries the destination, the
    // Pressable just under it repeats the name. Count it once.
    if (prev && prev.file === `apps/mobile/${rel}` && i + 1 - prev.line <= 2 && prev.name === entryName && destinationOf(block) === 'dynamic') continue;
    entries.push({
      surface: surfaceOf(rel),
      file: `apps/mobile/${rel}`,
      line: i + 1,
      role: roleOf(block, tag),
      name: entryName,
      destination: destinationOf(block),
    });
  }
  for (let i = 0; i < lines.length; i++) {
    const t = PAGE_OPEN.exec(lines[i]);
    if (!t || /^\s*(\*|\/\/)/.test(lines[i])) continue;
    for (const a of barProps(readTag(lines, i, t.index).block)) {
      entries.push({ surface: surfaceOf(rel), file: `apps/mobile/${rel}`, line: i + 1, role: 'button', name: a.name, destination: a.destination });
    }
  }
  for (const a of arrayActions(lines.join('\n'))) {
    entries.push({ surface: surfaceOf(rel), file: `apps/mobile/${rel}`, line: a.line, role: 'button', name: a.name, destination: a.destination });
  }
  // keep each file's entries in line order
  const first = entries.findIndex((e) => e.file === `apps/mobile/${rel}`);
  if (first >= 0) entries.splice(first, entries.length - first, ...entries.slice(first).sort((x, y) => x.line - y.line));
}

// M31 blind-spot 2: what each screen hands to a kit part. A moved action lives in the kit part, but it only
// works if the screen still passes a real handler for it, so the replay reads these too.
//   attr:  <NowBar onQueue={() => queueSheet.open()} />       key:  { onOpen: go }       short: { onOpen, onToggle }
const EMPTY_HANDLER = /^(?:undefined|null|noop|\(\s*\)\s*=>\s*(?:\{\s*\}|undefined|null|void 0|\(\s*\)))$/;
const passes = [];
const usages = []; // every `<Tag` site, so a replay can tell "never passes the prop" from "nobody renders the part"
const fileTokens = {}; // per file: its dotted names and quoted routes, so a replay can ask "does this file still mention the destination"
for (const abs of files) {
  const rel = path.relative(MOBILE, abs).split(path.sep).join('/');
  const file = `apps/mobile/${rel}`;
  const text = readFileSync(abs, 'utf8');
  fileTokens[file] = [...new Set([...(text.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g) ?? []), ...(text.match(/['"`]\/[^'"`]*['"`]/g) ?? []).map((x) => x.slice(1, -1))])];
  const lines = text.split('\n');
  const add = (line, tag, name, handler, form) => {
    const h = clean(handler);
    passes.push({ file, line, tag, prop: name, form, handler: h, empty: EMPTY_HANDLER.test(h), destination: destinationOf(`onPress={${h}}`) });
  };
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].trim();
    if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) continue;
    for (const t of lines[i].matchAll(/<([A-Z]\w*)\b/g)) {
    usages.push({ file, line: i + 1, tag: t[1] });
    const { block } = readTag(lines, i, t.index);
    const re = /\b(on[A-Z]\w*)\s*=\s*\{/g;
    let m;
    while ((m = re.exec(block))) {
      const v = prop(block, m[1]);
      add(i + 1, t[1], m[1], v ?? '', 'attr');
    }
    if (/\{\s*\.\.\.\w/.test(block)) add(i + 1, t[1], '...', '...spread', 'spread');
    }
  }
  const kre = /(?:^|[{,\s])(on[A-Z]\w*)\s*(:|(?=\s*[,}]))/g;
  let km;
  while ((km = kre.exec(text))) {
    const line = text.slice(0, km.index).split('\n').length;
    if (km[2] === ':') add(line, '', km[1], valueAt(text, km.index + km[0].length), 'key');
    else if (/^\s*[{,]/.test(text.slice(Math.max(0, km.index - 1), km.index + 1)) || /[{,]\s*$/.test(text.slice(Math.max(0, km.index - 40), km.index + (km[0].startsWith(km[1]) ? 0 : 1)))) add(line, '', km[1], km[1], 'short');
  }
}

const arg = process.argv.indexOf('--commit');
let commit = arg > 0 ? process.argv[arg + 1] : '';
if (!commit) {
  try { commit = execSync('git rev-parse --short HEAD', { cwd: MOBILE }).toString().trim(); } catch { commit = '0000000'; }
}
process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), commit, entries, passes, usages, fileTokens }, null, 1) + '\n');
