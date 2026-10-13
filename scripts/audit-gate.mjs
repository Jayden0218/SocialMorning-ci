// The dependency audit gate (M28 US5, G-M28-AUDIT / G-M28-ALLOW): fails on a high or critical advisory in the production tree that security/audit-allow.json does not cover.
//
// SCOPE RULE (a correction of contracts/gates.md and T051). The lockfile is hoisted, so every advisory's `nodes`
// is `node_modules/<pkg>`, never a path under apps/mobile; the scope cannot be read from the paths. It is computed
// from the lockfile's own dependency graph instead (package-lock.json `packages`, resolved the way npm resolves:
// nearest enclosing node_modules, workspace links followed). Roots: every workspace under apps/* except
// apps/mobile, plus packages/* (apps/api, apps/studio and the shared packages); edges: dependencies,
// optionalDependencies and peerDependencies, never devDependencies. A package is `server` scope if any of the
// lockfile nodes the advisory names is reachable from those roots, else `mobile` (reachable only from apps/mobile,
// i.e. Expo / Metro / React Native build tooling). Studio counts as server, as the contract says.
//
// Fails (exit 1): an unlisted high/critical; an allow-list entry past its `expires` (UTC) or with no `reason`;
// a server-scope advisory that is listed while `fixAvailable` (server code fixes, it does not allow-list);
// the registry unreachable ("audit: registry unreachable" - never silently green).
//
// Usage: node scripts/audit-gate.mjs [--audit f.json] [--lock package-lock.json] [--allow f.json] [--today YYYY-MM-DD]
// Without --audit it runs `npm audit --omit=dev --json` once. The other flags exist for the tests.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const lockFile = args.get('--lock') ?? path.join(root, 'package-lock.json');
const allowFile = args.get('--allow') ?? path.join(root, 'security', 'audit-allow.json');
const today = args.get('--today') ?? new Date().toISOString().slice(0, 10);
const BAD = ['high', 'critical'];

function fail(msg) { console.log(msg); process.exit(1); }

// 1. The audit report. npm exits 1 when it finds vulnerabilities, so only the JSON decides.
let report;
try {
  const raw = args.has('--audit')
    ? readFileSync(args.get('--audit'), 'utf8')
    : spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout;
  report = JSON.parse(raw);
} catch { report = null; }
if (!report || report.error || !report.vulnerabilities) fail('audit: registry unreachable');

// 2. Which lockfile nodes the server side reaches.
const lock = JSON.parse(readFileSync(lockFile, 'utf8')).packages ?? {};
function resolve(base, name) {
  for (;;) {
    const cand = (base ? base + '/' : '') + 'node_modules/' + name;
    if (lock[cand]) return cand;
    if (!base) return null;
    const i = base.lastIndexOf('node_modules/');
    base = i < 0 ? '' : base.slice(0, i).replace(/\/$/, '');
  }
}
const serverNodes = new Set();
const queue = Object.keys(lock).filter((k) => /^(apps\/(?!mobile$)[^/]+|packages\/[^/]+)$/.test(k));
while (queue.length) {
  const node = queue.pop();
  if (serverNodes.has(node)) continue;
  serverNodes.add(node);
  const e = lock[node] ?? {};
  if (e.link && e.resolved) queue.push(e.resolved);
  for (const group of [e.dependencies, e.optionalDependencies, e.peerDependencies])
    for (const name of Object.keys(group ?? {})) { const r = resolve(node, name); if (r) queue.push(r); }
}

// 3. The advisories: one per (GHSA, package), taken from the object entries of `via`.
const found = new Map();
for (const v of Object.values(report.vulnerabilities)) {
  for (const via of v.via ?? []) {
    if (typeof via !== 'object' || !BAD.includes(via.severity)) continue;
    const ghsa = String(via.url ?? '').split('/').pop();
    const own = report.vulnerabilities[via.name] ?? v;
    const nodes = own.nodes ?? [];
    found.set(ghsa + '|' + via.name, {
      ghsa, package: via.name, severity: via.severity,
      scope: nodes.some((n) => serverNodes.has(n)) ? 'server' : 'mobile',
      fixAvailable: Boolean(own.fixAvailable),
    });
  }
}

// 4. The allow-list.
let allow;
try { allow = JSON.parse(readFileSync(allowFile, 'utf8')); } catch { fail('audit: cannot read ' + allowFile); }
if (!Array.isArray(allow)) fail('audit: ' + allowFile + ' must be an array');
const failures = [];
const listed = new Map();
for (const e of allow) {
  if (!e.ghsa) { failures.push('allow-list entry with no ghsa: ' + JSON.stringify(e)); continue; }
  if (!e.reason || !String(e.reason).trim()) failures.push(`${e.ghsa} ${e.package ?? '?'} allow-list entry has no reason`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? '') || e.expires < today) failures.push(`${e.ghsa} ${e.package ?? '?'} allow-list entry expired or has no valid expires (${e.expires}; today ${today})`);
  listed.set(e.ghsa, e);
}
let used = 0, earliest = null;
for (const a of found.values()) {
  const line = `${a.ghsa} ${a.package} ${a.severity} ${a.scope}`;
  const e = listed.get(a.ghsa);
  if (!e) { failures.push(line + ' not in security/audit-allow.json'); continue; }
  if (a.scope === 'server' && a.fixAvailable) { failures.push(line + ' is server scope and a fix is available: fix it, do not allow-list it'); continue; }
  used++;
  if (!earliest || e.expires < earliest) earliest = e.expires;
}
if (failures.length) { for (const f of failures) console.log(f); process.exit(1); }
console.log(`audit: 0 unallowed high/critical (${used} allow-listed, earliest expiry ${earliest ?? 'none'})`);
