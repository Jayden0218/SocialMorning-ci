#!/usr/bin/env node
// The page-frame ratchet: how many pages are not built on `Page` or `PushedPage` can only go down.
/**
 * 039 T030 (D8). A PAGE is a file under `app/` that
 *   - is a `.tsx` file,
 *   - is not a layout (`_layout.tsx`) and does not start with `_` or `+` (route plumbing: `+not-found`, `+html`),
 *   - has a default export (a route screen), and
 *   - is not a PURE REDIRECT: after comments are removed, its only JSX component tag is `<Redirect`
 *     (a file with a `<Redirect` and any other component tag is a page).
 * A page is FRAMED (2026-11-06, D6 revised) when it renders `<Page` or `<PageList` imported from '@/ui/kit/layout', OR renders a component
 * it imports from `src/` (an `@/` or relative import) whose own file renders `<Page`/`<PageList` from '@/ui/kit/layout' (ONE level: FollowList,
 * the settings panel and the like count once they are converted). 039 I1: the chain is followed up to 4 local imports deep (SetPage ->
 * SettingsPage -> Page; FeedPage -> PageList; DetailPage; FormPage), cycles are cut. `PushedPage` is the OLD frame and does not count; nor does `OverlayPage`.
 * The count of unframed pages is compared with `scripts/page-frame-baseline.json` ({ "unframed": N, "files": [...] }):
 * it fails (exit 1, with the list) when the count is UP or a file not in the baseline is unframed; when the count is lower it
 * says so, and `--write` rewrites the baseline (it never raises it without `--allow-up`).
 *
 * EXEMPT pages (`scripts/page-frame-exempt.json`, `{ "app/x.tsx": "reason" }`; owner decisions) are neither framed nor unframed: they are
 * left out of the count and listed with their reason on every run.
 *
 * `--json` prints { 'app/x.tsx': { status: 'framed'|'unframed'|'exempt', direct, wrapped } } for every page (used by __tests__/no-native-ui.test.ts,
 * so the "every page draws the app's own bar" guard and this ratchet share ONE definition of a frame).
 *
 *   node scripts/page-frame-check.mjs [--root <dir>] [--baseline <file>] [--exempt <file>] [--write] [--json]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const onLayout = (code) => {
  const imp = /\bimport\s*\{([^}]*)\}\s*from\s*['"]@\/ui\/kit\/layout['"]/.exec(code);
  if (!imp) return false;
  const names = imp[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop());
  return names.some((n) => (n === 'Page' || n === 'PageList') && new RegExp('<' + n + '[\\s>/<]').test(code));
};

/** The local components a file imports and renders: [{ spec, name }]. */
function localUses(code) {
  const out = [];
  for (const m of code.matchAll(/\bimport\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]((?:@\/|\.\.?\/)[^'"]+)['"]/g)) {
    const names = [m[1], ...(m[2] ?? '').split(',').map((x) => x.trim().split(/\s+as\s+/).pop())].filter(Boolean);
    for (const n of names) if (new RegExp('<' + n + '[\\s>/<]').test(code)) out.push({ spec: m[3], name: n });
  }
  return out;
}

export const MAX_DEPTH = 4;

/**
 * `read(spec, from)` returns { file, text } of a local module ('@/ui/x' or './x', resolved against `from`, the importing file) or undefined.
 * Returns 'skip' (not a page), or 'framed' / 'unframed'.
 */
export function classify(file, text, read = () => undefined) {
  return detail(file, text, read).status;
}

/** `classify` with how the page is framed: `direct` (it renders Page/PageList itself) and `wrapped` (a local component it renders is framed). */
export function detail(file, text, read = () => undefined) {
  const skip = { status: 'skip', direct: false, wrapped: false };
  const base = file.split('/').pop();
  if (!base.endsWith('.tsx') || base === '_layout.tsx' || base.startsWith('_') || base.startsWith('+')) return skip;
  const code = stripComments(text);
  if (!/\bexport\s+default\b/.test(code)) return skip;
  const tags = [...code.matchAll(/<([A-Z][\w.]*)/g)].map((m) => m[1]);
  if (tags.length > 0 && tags.every((t) => t === 'Redirect')) return skip;
  const direct = onLayout(code);
  const wrapped = framedBy(file, code.replace(/\bimport\s*\{[^}]*\}\s*from\s*['"]@\/ui\/kit\/layout['"]/, ''), read, MAX_DEPTH, new Set([file]));
  return { status: direct || wrapped ? 'framed' : 'unframed', direct, wrapped };
}

function framedBy(file, code, read, depth, seen) {
  if (onLayout(code)) return true;
  if (depth === 0) return false;
  for (const { spec } of localUses(code)) {
    const mod = read(spec, file);
    if (mod === undefined || seen.has(mod.file)) continue;
    seen.add(mod.file);
    if (framedBy(mod.file, stripComments(mod.text), read, depth - 1, seen)) return true;
  }
  return false;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Returns { unframed: string[], framed: number, exempted: string[], files: { [rel]: { status, direct, wrapped } } }, files relative to the app root, `/`-separated, sorted. */
export function scan(root, exempt = {}) {
  const appDir = path.join(root, 'app');
  const unframed = [];
  const exempted = [];
  const files = {};
  let framed = 0;
  for (const f of existsSync(appDir) ? walk(appDir) : []) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const read = (spec, from) => {
      const abs = from.startsWith('app/') ? path.join(root, from) : from;
      const base = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(abs), spec);
      for (const c of [base + '.tsx', path.join(base, 'index.tsx')]) if (existsSync(c) && statSync(c).isFile()) return { file: c, text: readFileSync(c, 'utf8') };
      return undefined;
    };
    const d = detail(rel, readFileSync(f, 'utf8'), read);
    const c = d.status;
    if (c !== 'skip') files[rel] = rel in exempt ? { ...d, status: 'exempt' } : d;
    if (c !== 'skip' && rel in exempt) exempted.push(rel);
    else if (c === 'unframed') unframed.push(rel);
    else if (c === 'framed') framed += 1;
  }
  return { unframed: unframed.sort(), framed, exempted: exempted.sort(), files };
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const root = arg('--root') ?? MOBILE;
  const baselineFile = arg('--baseline') ?? path.join(MOBILE, 'scripts', 'page-frame-baseline.json');
  const exemptFile = arg('--exempt') ?? path.join(MOBILE, 'scripts', 'page-frame-exempt.json');
  const exempt = existsSync(exemptFile) ? JSON.parse(readFileSync(exemptFile, 'utf8')) : {};
  const { unframed, framed, exempted, files } = scan(root, exempt);
  if (argv.includes('--json')) { console.log(JSON.stringify(files)); return 0; }
  const note = exempted.map((f) => `page-frame: exempt: ${f} — ${exempt[f]}`).join('\n');
  const base = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : { unframed: Infinity, files: [] };
  const fresh = unframed.filter((f) => !base.files.includes(f));
  if (argv.includes('--write')) {
    if (unframed.length > base.unframed && !argv.includes('--allow-up')) {
      console.log(`page-frame: refusing to raise the baseline (${base.unframed} -> ${unframed.length}); the new unframed pages are:\n${fresh.join('\n')}`);
      return 1;
    }
    writeFileSync(baselineFile, JSON.stringify({ unframed: unframed.length, files: unframed }, null, 2) + '\n');
    console.log(`page-frame: baseline written, ${unframed.length} unframed pages (${framed} framed, ${exempted.length} exempt)`);
    if (note) console.log(note);
    return 0;
  }
  if (unframed.length > base.unframed || fresh.length > 0) {
    console.log(`page-frame: ${unframed.length} pages are not built on Page or PageList; the baseline allows ${base.unframed}. New:\n${fresh.map((f) => '  ' + f).join('\n')}\nBuild the page on Page or PageList (@/ui/kit/layout).`);
    return 1;
  }
  console.log(`page-frame: ${unframed.length} unframed (baseline ${base.unframed}), ${framed} framed`);
  if (note) console.log(note);
  if (unframed.length < base.unframed) console.log('page-frame: the count went down; run `node scripts/page-frame-check.mjs --write` to lower the baseline.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
