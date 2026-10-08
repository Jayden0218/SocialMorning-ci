#!/usr/bin/env node
// Writes the open-source licence list the app shows (Settings › About › Open-source licences).
/**
 * M25 L2 (security audit #51): the app ships MIT, Apache, BSD and OFL code and fonts, and showed
 * none of their notices. This script lists every package the PHONE APP ships — the runtime
 * dependency tree of apps/mobile, read from the root package-lock.json (dev-only packages and our
 * own workspace packages are left out) — with its licence, and the text of its LICENSE file when
 * node_modules has the same version. It writes `src/legal/licences.json`, which the phone reads.
 *
 *   node scripts/licences.mjs          (from apps/mobile; reads files only, installs nothing)
 *
 * Run it after a dependency changes and commit the JSON. Identical licence texts are stored once
 * (`texts`) and referenced by index, to keep the bundle small.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join('..', '..');
const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const pkgs = lock.packages;
/** Where node_modules is installed (a git worktree has none: point this at the main checkout). */
const MODULES = process.env.LICENCES_MODULES_ROOT ?? ROOT;

/** Node's lookup: `<from>/node_modules/<name>`, then each parent's node_modules, up to the root. */
export function resolve(packages, from, name) {
  let dir = from;
  for (;;) {
    const key = `${dir ? `${dir}/` : ''}node_modules/${name}`;
    if (packages[key]) return key;
    if (!dir) return undefined;
    const i = dir.lastIndexOf('/node_modules/');
    dir = i >= 0 ? dir.slice(0, i) : dir.startsWith('node_modules/') ? '' : dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
  }
}

/**
 * Build tools that `expo` and `react-native` list as dependencies but that never reach the phone
 * (the bundler, Babel, the CLI, config plugins, TypeScript). The walk stops at them; a package
 * they share with the app is still reached through the app's own path.
 */
export const BUILD_ONLY = /^(@expo\/(cli|config|config-plugins|config-types|prebuild-config|metro-config|metro|fingerprint|image-utils|xcpretty|plist|json-file|env|osascript|package-manager|spawn-async|devcert|server|schema-utils|code-signing-certificates|ws-tunnel)|metro(-[a-z-]+)?|@babel\/(?!runtime$).+|babel-.+|typescript|jest.*|@react-native\/(babel-[a-z-]+|codegen|community-cli-plugin|dev-middleware|metro-config|gradle-plugin|debugger-frontend)|expo-module-scripts|@react-native-community\/cli.*|esbuild|@esbuild\/.+|@emnapi\/.+|@napi-rs\/.+|@tybys\/.+|@bacons\/.+|lightningcss.*|@tailwindcss\/oxide.*)$/;

/** Every lock key the app reaches at run time, from `start` (a workspace path such as "apps/mobile"). */
export function runtimeTree(packages, start) {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const at = queue.shift();
    const p = packages[at];
    if (!p) continue;
    const deps = { ...(p.dependencies ?? {}), ...(p.optionalDependencies ?? {}), ...(p.peerDependencies ?? {}) };
    for (const name of Object.keys(deps)) {
      if (BUILD_ONLY.test(name)) continue;
      let key = resolve(packages, at, name);
      if (!key) continue;
      if (packages[key].link) key = packages[key].resolved; // a workspace package: walk its own deps
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(key);
    }
  }
  return [...seen];
}

const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

function licenceText(dir) {
  if (!existsSync(dir)) return undefined;
  const f = readdirSync(dir).find((n) => LICENCE_FILE.test(n));
  return f ? readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim() : undefined;
}

function main() {
  const keys = runtimeTree(pkgs, 'apps/mobile').filter((k) => k.includes('node_modules/') && !pkgs[k].dev);
  const texts = [];
  const textIndex = new Map();
  const list = [];
  let missing = 0;
  for (const key of keys) {
    const p = pkgs[key];
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const dir = path.join(MODULES, key);
    let meta = {};
    try { meta = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { /* not installed here */ }
    const sameVersion = meta.version === p.version;
    const text = sameVersion ? licenceText(dir) : undefined;
    if (!text) missing += 1;
    let t;
    if (text) {
      if (!textIndex.has(text)) { textIndex.set(text, texts.length); texts.push(text); }
      t = textIndex.get(text);
    }
    const repo = typeof meta.repository === 'string' ? meta.repository : meta.repository?.url;
    const url = (meta.homepage || repo || '').replace(/^git\+/, '').replace(/\.git$/, '');
    list.push({
      name,
      version: p.version,
      licence: p.license ?? (typeof meta.license === 'string' ? meta.license : 'See the package'),
      ...(url ? { url } : {}),
      ...(t !== undefined ? { text: t } : {}),
    });
  }
  // One row per name@version (a package can sit at two paths), sorted by name.
  const unique = [...new Map(list.map((e) => [`${e.name}@${e.version}`, e])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const out = { generated: new Date().toISOString().slice(0, 10), packages: unique, texts };
  writeFileSync(path.join('src', 'legal', 'licences.json'), `${JSON.stringify(out)}\n`);
  console.log(`licences: ${unique.length} packages, ${texts.length} distinct licence texts, ${missing} without a text in node_modules`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
