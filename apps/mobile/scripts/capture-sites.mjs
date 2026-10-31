// Finds every screen and popup the phone app's code can show, as a list of stable site ids.
/**
 * M27 (specs/031-m29-screen-capture, FR-003): the reader behind the capture-coverage guard. It
 * reads files only (a grep, like a11y-audit and action-inventory) and lists every "site" —
 * a place in the code that puts something on screen that a person could see in a picture:
 *
 *   route       a file in app/ (not _layout / README)
 *   sheet       <Actionsheet>, <ActionSheet> (M31 kit), <Sheet>, <Modal>, <EpisodeRowSheet> opened in a file (ordinal in the file)
 *   dialog      confirm({ title }) or the kit <Dialog title=…>  — keyed by the title, or the ordinal when it is not a literal
 *   toast       toast('…') / deps.notify('…') — keyed by the words, or the ordinal
 *   empty       <EmptyState surface=…>  — keyed by the surface, or the ordinal
 *   surface     one per key of EMPTY_STATES in packages/social-core/src/empty.ts
 *   permission  request…PermissionsAsync / useCameraPermissions — keyed by the function
 *   system      Share.share, the photo picker, the in-app browser, Linking.openURL/openSettings,
 *               Alert.alert, ActionSheetIOS, the file picker — ordinal per kind in the file
 *
 * An id is `<path from apps/mobile>::<kind>::<key>`. Line numbers are reported, never part of
 * the id, so moving code does not break the inventory; adding or removing a site does.
 *
 *   node scripts/capture-sites.mjs        → JSON on stdout
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(MOBILE, '..', '..');

/** Files that DEFINE a popup (their own <Actionsheet> is the part, not a screen): skipped for sheets. */
const DEFINES = new Set(['src/ui/kit/Sheet.tsx', 'src/ui/kit/confirm.tsx', 'src/ui/kit/EpisodeRowSheet.tsx', 'src/ui/kit/ActionSheet.tsx', 'src/ui/kit/Dialog.tsx']);
const skipDir = (rel) => rel === 'src/ui/lib' || rel.includes('__tests__') || rel.includes('node_modules');

function walk(root, out = []) {
  const abs = path.join(MOBILE, root);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    const rel = `${root}/${name}`;
    if (statSync(path.join(MOBILE, rel)).isDirectory()) { if (!skipDir(rel)) walk(rel, out); continue; }
    if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts')) out.push(rel);
  }
  return out;
}

/** Strip comments (so a doc comment naming `toast('x')` is not a site) but keep line numbers. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => { const t = l.trimStart(); return t.startsWith('//') ? '' : l.replace(/(^|[^:'"`])\/\/ .*$/, '$1'); })
    .join('\n');
}

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
/** First string literal at the start of `s` (after optional whitespace): its text, else undefined. */
function literal(s) {
  const m = /^\s*(?:(')((?:\\.|[^'\\\n])*)'|(")((?:\\.|[^"\\\n])*)"|(`)((?:\\.|[^`\\])*)`)/.exec(s);
  if (!m) return undefined;
  return norm((m[2] ?? m[4] ?? m[6] ?? '').replace(/\\(['"`])/g, '$1'));
}

export function scan() {
  const sites = [];
  const add = (file, kind, key, line, extra = {}) => sites.push({ id: `${file}::${kind}::${key}`, file, kind, key, line, ...extra });

  // Routes.
  for (const rel of walk('app')) {
    if (rel.endsWith('/_layout.tsx')) continue;
    add(rel, 'route', 'route', 1, { route: routeOf(rel) });
  }

  for (const rel of [...walk('app'), ...walk('src')]) {
    const raw = readFileSync(path.join(MOBILE, rel), 'utf8');
    const src = code(raw);
    const seen = new Map();
    const once = (kind, key, idx, extra) => {
      const id = `${kind}::${key}`;
      if (seen.has(id)) { seen.get(id).lines.push(lineOf(src, idx)); return; }
      const s = { lines: [lineOf(src, idx)] };
      seen.set(id, s);
      add(rel, kind, key, s.lines[0], { ...extra, lines: s.lines });
    };
    const nth = new Map();
    const ordinal = (kind) => { const n = (nth.get(kind) ?? 0) + 1; nth.set(kind, n); return `#${n}`; };

    if (!DEFINES.has(rel)) {
      for (const m of src.matchAll(/<(Actionsheet|ActionSheet|Sheet|Modal|EpisodeRowSheet)\b/g)) once('sheet', ordinal('sheet'), m.index, { tag: m[1] });
    }
    // M31: the kit `<Dialog title="…">` used directly (confirm() renders one inside kit/confirm.tsx, a DEFINES file).
    if (!DEFINES.has(rel)) {
      for (const m of src.matchAll(/<Dialog\b/g)) {
        const t = /\btitle=/.exec(src.slice(m.index, m.index + 400));
        const lit = t ? literal(src.slice(m.index + t.index + t[0].length).replace(/^\{/, '')) : undefined;
        once('dialog', lit ?? ordinal('dialog'), m.index);
      }
    }
    for (const m of src.matchAll(/(?<![.\w])confirm\(\s*\{/g)) {
      const t = /\btitle:\s*/.exec(src.slice(m.index, m.index + 400));
      const lit = t ? literal(src.slice(m.index + t.index + t[0].length)) : undefined;
      once('dialog', lit ?? ordinal('dialog'), m.index);
    }
    for (const m of src.matchAll(/(?<![.\w])toast\(|\bdeps\.notify\(/g)) {
      const lit = literal(src.slice(m.index + m[0].length));
      once('toast', lit ?? `<dynamic>${ordinal('toast')}`, m.index);
    }
    for (const m of src.matchAll(/<EmptyState\b/g)) {
      const s = /surface=(?:"([^"]+)"|\{([^}]+)\})/.exec(src.slice(m.index, m.index + 200));
      once('empty', s ? (s[1] ?? norm(s[2])) : ordinal('empty'), m.index);
    }
    for (const m of src.matchAll(/\b(request[A-Za-z]*PermissionsAsync|useCameraPermissions)\b/g)) {
      // The type declaration `requestPermissionsAsync(): Promise<…>` is not a call.
      if (/^\s*\(\)\s*:\s*Promise/.test(src.slice(m.index + m[1].length, m.index + m[1].length + 40))) continue;
      if (/^\s*\(\s*\)\s*=>/.test(src.slice(m.index - 0, m.index + 0))) continue;
      once('permission', m[1], m.index);
    }
    const SYSTEM = [
      ['Share.share', /\bShare\.share\(/g], ['photo-picker', /\blaunchImageLibraryAsync\(/g], ['camera-picker', /\blaunchCameraAsync\(/g],
      ['browser', /\bopenBrowserAsync\(/g], ['open-url', /\bLinking\.openURL\(/g], ['open-settings', /\b(Linking\.openSettings|openSettings)\(/g],
      ['alert', /\bAlert\.alert\(/g], ['action-sheet-ios', /\bActionSheetIOS\.[a-zA-Z]+\(/g], ['file-picker', /\bgetDocumentAsync\(/g],
      ['clipboard', /\bsetStringAsync\(/g],
    ];
    for (const [name, re] of SYSTEM) for (const m of src.matchAll(re)) once('system', `${name}${ordinal('system:' + name)}`, m.index);
  }

  // One surface per EMPTY_STATES key.
  const emptyFile = path.join(REPO, 'packages/social-core/src/empty.ts');
  if (existsSync(emptyFile)) {
    const text = readFileSync(emptyFile, 'utf8');
    const block = /EMPTY_STATES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(text)?.[1] ?? '';
    for (const m of block.matchAll(/^\s{2}([a-z]+):\s*\{/gm)) {
      sites.push({ id: `packages/social-core/src/empty.ts::surface::${m[1]}`, file: 'packages/social-core/src/empty.ts', kind: 'surface', key: m[1], line: lineOf(text, text.indexOf(m[0])) });
    }
  }
  return sites.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** `app/(tabs)/me.tsx` → `/me`; `app/settings/push.tsx` → `/settings/push`; `app/show/[feedUrl].tsx` → `/show/[feedUrl]`. */
export function routeOf(rel) {
  const r = rel.slice(4).replace(/\.tsx?$/, '').replace(/\([^)]*\)\//g, '').replace(/(^|\/)index$/, '');
  return '/' + r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(scan(), null, 1) + '\n');
}
