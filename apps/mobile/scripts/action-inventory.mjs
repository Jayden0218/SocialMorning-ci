#!/usr/bin/env node
/**
 * M17 (FR-007, guard G-E3): the action inventory — every interactive element in app/ and src/
 * with its role, its accessible name and where it goes, so a rebuilt screen can be checked
 * against what it had before. A grep, not a renderer (research R7), built from the a11y audit's
 * element reader and tap-counts' destination matcher. It reads files only.
 *
 *   node scripts/action-inventory.mjs            → JSON on stdout
 *   node scripts/action-inventory.mjs --commit X → stamps `commit` (default: git HEAD)
 *
 * Output shape: specs/018-m17-editorial/contracts/action-inventory.schema.json.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAGS = 'Pressable|TouchableOpacity|TouchableHighlight|Switch|TextInput|Link|Row|Button|Chip|NavLink|TabBar|ActionsheetItem|Slider|TextareaInput|InputField|Fab|Checkbox|Radio|MenuRow|LinkRow|SheetRow';
const OPEN = new RegExp(`<(${TAGS})\\b`);

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && p !== path.join(MOBILE, 'src', 'ui', 'lib')) walk(p);
      continue;
    }
    if (/\.tsx$/.test(p)) files.push(p);
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

const nameOf = (block, tag) => {
  for (const p of ['accessibilityLabel', 'aria-label']) {
    const v = prop(block, p);
    if (v) return v;
  }
  if (tag === 'Row') { const v = prop(block, 'title'); if (v) return v; }
  for (const p of ['label', 'title', 'placeholder']) {
    const v = prop(block, p);
    if (v) return v;
  }
  const text = /<[A-Za-z]*Text\b[^>]*>([^<]+)</.exec(block);
  if (text) return clean(text[1]);
  return '';
};

const destinationOf = (block) => {
  const href = prop(block, 'href');
  if (href) return href;
  const push = /router\.(push|replace|navigate|back)\(\s*(?:'([^']*)'|`([^`]*)`|\{\s*pathname:\s*'([^']*)'|\))?/.exec(block);
  if (push) return push[1] === 'back' ? 'back' : (push[2] ?? push[3] ?? push[4] ?? 'dynamic');
  for (const p of ['onPress', 'onValueChange', 'onChangeText', 'onSubmitEditing', 'onLongPress']) {
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
  return { Switch: 'switch', TextInput: 'input', InputField: 'input', TextareaInput: 'input', Slider: 'adjustable',
    Link: 'link', MenuRow: 'link', LinkRow: 'link', Checkbox: 'checkbox', Radio: 'radio', TabBar: 'tablist' }[tag] ?? 'button';
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
    // Read the opening tag only (to its `>` or `/>`), past arrows and comparisons in props.
    let block = '';
    for (let j = i; j < Math.min(lines.length, i + 40); j++) {
      block += (j === i ? lines[j].slice(open.index) : lines[j]) + '\n';
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
        const rest = lines.slice(j, j + 6).join('\n');
        block = block + rest;
        break;
      }
    }
    const prev = entries[entries.length - 1];
    const entryName = nameOf(block, tag);
    // `<Link asChild><Pressable …>` is one action: the Link carries the destination, the
    // Pressable just under it repeats the name. Count it once.
    if (prev && prev.file === `apps/mobile/${rel}` && i + 1 - prev.line <= 2 && prev.name === entryName && destinationOf(block) === 'dynamic') continue;
    entries.push({
      surface: surfaceOf(rel),
      file: `apps/mobile/${rel}`,
      line: i + 1,
      role: roleOf(block, tag),
      name: nameOf(block, tag),
      destination: destinationOf(block),
    });
  }
}

const arg = process.argv.indexOf('--commit');
let commit = arg > 0 ? process.argv[arg + 1] : '';
if (!commit) {
  try { commit = execSync('git rev-parse --short HEAD', { cwd: MOBILE }).toString().trim(); } catch { commit = '0000000'; }
}
process.stdout.write(JSON.stringify({ capturedAt: new Date().toISOString(), commit, entries }, null, 1) + '\n');
