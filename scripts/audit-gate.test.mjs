// Guards G-M28-AUDIT and G-M28-ALLOW: audit-gate.mjs fails on an unlisted, expired, reasonless or fixable-server advisory, and on an unreachable registry.
// Run: node --test scripts/audit-gate.test.mjs. It feeds recorded-shape `npm audit --json` fixtures and a small lockfile; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-gate.mjs');
const dir = mkdtempSync(path.join(tmpdir(), 'audit-gate-'));
const write = (name, data) => { const f = path.join(dir, name); writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data)); return f; };

// Hoisted lockfile: apps/api needs `hono-ish` (and, nested, `leaf`); apps/mobile needs `expo-ish` -> `forge`.
const lock = write('lock.json', {
  packages: {
    '': {},
    'apps/api': { dependencies: { 'hono-ish': '1' }, devDependencies: { 'dev-only': '1' } },
    'apps/mobile': { dependencies: { 'expo-ish': '1' } },
    'node_modules/hono-ish': { dependencies: { leaf: '1' } },
    'node_modules/leaf': {},
    'node_modules/expo-ish': { dependencies: { forge: '1' } },
    'node_modules/forge': {},
    'node_modules/dev-only': {},
  },
});
const vuln = (name, ghsa, severity, fixAvailable) => ({
  name, severity, isDirect: false, effects: [], range: '*', nodes: ['node_modules/' + name], fixAvailable,
  via: [{ source: 1, name, dependency: name, title: 't', url: 'https://github.com/advisories/' + ghsa, severity, range: '*' }],
});
const auditOf = (...vs) => write('audit-' + Math.random() + '.json', { auditReportVersion: 2, vulnerabilities: Object.fromEntries(vs.map((v) => [v.name, v])), metadata: {} });
const entry = (ghsa, pkg, over = {}) => ({ ghsa, package: pkg, scope: 'mobile', reason: 'Expo 58 pin, T057 (build tooling)', expires: '2099-01-31', ...over });
const run = (audit, allow, extra = []) => spawnSync('node', [script, '--audit', audit, '--lock', lock, '--allow', write('allow-' + Math.random() + '.json', allow), '--today', '2026-10-12', ...extra], { encoding: 'utf8' });

test('an unlisted high fails and names its GHSA, package, severity and scope', () => {
  const r = run(auditOf(vuln('forge', 'GHSA-aaaa-bbbb-cccc', 'high', false)), []);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GHSA-aaaa-bbbb-cccc forge high mobile/);
});

test('an unlisted critical fails', () => {
  const r = run(auditOf(vuln('forge', 'GHSA-crit-0000-0000', 'critical', false)), []);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GHSA-crit-0000-0000 forge critical mobile/);
});

test('an entry whose expires is yesterday fails', () => {
  const r = run(auditOf(vuln('forge', 'GHSA-aaaa-bbbb-cccc', 'high', false)), [entry('GHSA-aaaa-bbbb-cccc', 'forge', { expires: '2026-10-11' })]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GHSA-aaaa-bbbb-cccc.*expired/);
});

test('an entry with no reason fails', () => {
  const e = entry('GHSA-aaaa-bbbb-cccc', 'forge'); delete e.reason;
  const r = run(auditOf(vuln('forge', 'GHSA-aaaa-bbbb-cccc', 'high', false)), [e]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no reason/);
});

test('a server-scope advisory that is listed while a fix exists fails', () => {
  const r = run(auditOf(vuln('leaf', 'GHSA-srv0-0000-0000', 'high', true)), [entry('GHSA-srv0-0000-0000', 'leaf', { scope: 'server' })]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GHSA-srv0-0000-0000 leaf high server/);
});

test('a server-scope advisory with no fix may be listed; the same package with a fix and unlisted fails', () => {
  assert.equal(run(auditOf(vuln('leaf', 'GHSA-srv0-0000-0000', 'high', false)), [entry('GHSA-srv0-0000-0000', 'leaf', { scope: 'server' })]).status, 0);
  assert.equal(run(auditOf(vuln('leaf', 'GHSA-srv0-0000-0000', 'high', true)), []).status, 1);
});

test('a mobile-scope advisory with a fix available may be listed (the Expo pin)', () => {
  assert.equal(run(auditOf(vuln('forge', 'GHSA-aaaa-bbbb-cccc', 'high', true)), [entry('GHSA-aaaa-bbbb-cccc', 'forge')]).status, 0);
});

test('a package only a devDependency reaches is not server scope', () => {
  const r = run(auditOf(vuln('dev-only', 'GHSA-dev0-0000-0000', 'high', true)), []);
  assert.match(r.stdout, /GHSA-dev0-0000-0000 dev-only high mobile/);
});

test('moderate advisories are ignored; all listed and valid exits 0 with the summary', () => {
  const r = run(auditOf(vuln('forge', 'GHSA-aaaa-bbbb-cccc', 'high', false), vuln('hono-ish', 'GHSA-mod0-0000-0000', 'moderate', true)), [entry('GHSA-aaaa-bbbb-cccc', 'forge')]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), 'audit: 0 unallowed high/critical (1 allow-listed, earliest expiry 2099-01-31)');
});

test('a registry error exits 1 with "registry unreachable"', () => {
  for (const body of [{ error: { code: 'ENOTFOUND', summary: 'request failed' } }, 'not json at all', '']) {
    const r = run(write('err-' + Math.random() + '.json', body), []);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /audit: registry unreachable/);
  }
});

test('the checked-in allow-list is well formed: every entry has ghsa, reason and an ISO expires', async () => {
  const { readFileSync } = await import('node:fs');
  const list = JSON.parse(readFileSync(path.join(path.dirname(script), '..', 'security', 'audit-allow.json'), 'utf8'));
  for (const e of list) {
    assert.match(e.ghsa, /^GHSA-/);
    assert.ok(e.reason);
    assert.match(e.expires, /^\d{4}-\d{2}-\d{2}$/);
  }
});
