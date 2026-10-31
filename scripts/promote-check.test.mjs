// M30 T018: the promotion rules and the guards on .github/workflows/promote.yml.  Run: node --test scripts/promote-check.test.mjs
// The workflow guards read WORKFLOW_PATH (default .github/workflows/promote.yml) so a red run can use a temp copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPromotion, normalizeEnvironment, touchesDataShape } from './promote-check.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const d = (environment, state, createdAt, sha = SHA, ref = 'main') => ({ environment, sha, state, ref, createdAt });
const T = (n) => `2026-10-27T10:0${n}:00Z`;
const OKHOT = { branchExists: true, containsCommit: true, mainIsAncestor: true };
const run = (o) => checkPromotion({ commit: SHA, ref: 'main', deployments: [], backwardCompatible: false, hotfix: OKHOT, changedFiles: [], ...o });

test('qa needs a success in dev for that sha', () => {
  assert.equal(run({ to: 'qa', deployments: [d('dev', 'success', T(1))] }).allowed, true);
  assert.deepEqual(run({ to: 'qa', deployments: [] }), { allowed: false, reason: 'not yet in dev' });
});
test('staging with no qa record is refused: "not yet in qa"', () => {
  assert.deepEqual(run({ to: 'staging', deployments: [d('dev', 'success', T(1))] }), { allowed: false, reason: 'not yet in qa' });
});
test('staging with a qa success is allowed', () => assert.equal(run({ to: 'staging', deployments: [d('qa', 'success', T(1))] }).allowed, true));
test('a qa success of a DIFFERENT sha does not count', () => {
  assert.equal(run({ to: 'staging', deployments: [d('qa', 'success', T(1), OTHER)] }).reason, 'not yet in qa');
});
test('a qa deployment still running is not a success', () => {
  assert.equal(run({ to: 'staging', deployments: [d('qa', 'in_progress', T(1))] }).reason, 'not yet in qa');
});
test('prod needs staging: "not yet in staging"; qa alone is not enough', () => {
  assert.deepEqual(run({ to: 'prod', deployments: [d('qa', 'success', T(1))] }), { allowed: false, reason: 'not yet in staging' });
  assert.equal(run({ to: 'prod', deployments: [d('staging', 'success', T(1))] }).allowed, true);
});
test('a newer failure of that sha after the success blocks: "failed in qa"', () => {
  assert.deepEqual(run({ to: 'staging', deployments: [d('qa', 'success', T(1)), d('qa', 'failure', T(2))] }), { allowed: false, reason: 'failed in qa' });
  assert.equal(run({ to: 'prod', deployments: [d('staging', 'success', T(1)), d('staging', 'error', T(2))] }).reason, 'failed in staging');
});
test('an older failure followed by a success is allowed', () => {
  assert.equal(run({ to: 'staging', deployments: [d('qa', 'failure', T(1)), d('qa', 'success', T(2))] }).allowed, true);
});
test('unknown or missing target is refused', () => {
  assert.equal(run({ to: 'dev' }).allowed, false);
  assert.equal(run({ to: 'production' }).allowed, false);
  assert.equal(run({ to: undefined }).allowed, false);
});
test('empty or short sha is refused', () => {
  for (const commit of ['', 'abc1234', undefined]) {
    assert.equal(run({ to: 'staging', commit, deployments: [d('qa', 'success', T(1), 'abc1234')] }).allowed, false);
  }
});
test('hotfix/* enters staging without qa, and says hotfix', () => {
  const r = run({ to: 'staging', ref: 'hotfix/fix-login' });
  assert.equal(r.allowed, true);
  assert.match(r.reason, /hotfix/);
});
test('hotfix/* still needs staging before prod; a normal ref gets no hotfix pass', () => {
  assert.equal(run({ to: 'prod', ref: 'hotfix/x' }).reason, 'not yet in staging');
  assert.equal(run({ to: 'prod', ref: 'hotfix/x', deployments: [d('staging', 'success', T(1))] }).allowed, true);
  assert.equal(run({ to: 'staging', ref: 'main' }).allowed, false);
  assert.equal(run({ to: 'staging', ref: 'nothotfix/x' }).allowed, false);
});

// ---- P2: Vercel-style and AWS-style environment names ----
test('normalizeEnvironment: exact, Vercel (en dash, hyphen, em dash) and AWS names', () => {
  assert.deepEqual(normalizeEnvironment('qa'), { env: 'qa', role: 'api' });
  assert.deepEqual(normalizeEnvironment('Production \u2013 qa-api'), { env: 'qa', role: 'api' });
  assert.deepEqual(normalizeEnvironment('Production \u2013 dev-api'), { env: 'dev', role: 'api' });
  assert.deepEqual(normalizeEnvironment('Production - dev-studio'), { env: 'dev', role: 'studio' });
  assert.deepEqual(normalizeEnvironment('Production \u2014 qa-studio'), { env: 'qa', role: 'studio' });
  assert.equal(normalizeEnvironment('production').env, 'prod');
  assert.equal(normalizeEnvironment('stg').env, 'staging');
  assert.equal(normalizeEnvironment('sm').env, 'prod');
});
test('normalizeEnvironment: an unrelated project or junk maps to nothing', () => {
  for (const n of ['Production \u2013 marketing-site', 'Preview \u2013 qa-api', 'Preview - dev-api', 'Preview \u2014 dev-studio', 'Preview \u2013 staging-api', 'Production \u2013 prod-api', 'x', '', undefined, null]) {
    assert.equal(normalizeEnvironment(n).env, null, String(n));
  }
});
test('Vercel-style qa-api success lets staging through; dev-api lets qa through', () => {
  assert.equal(run({ to: 'staging', deployments: [d('Production \u2013 qa-api', 'success', T(1))] }).allowed, true);
  assert.equal(run({ to: 'qa', deployments: [d('Production \u2013 dev-api', 'success', T(1))] }).allowed, true);
});
test('a failing studio project does not block; a studio success alone does not count', () => {
  const api = d('Production \u2013 qa-api', 'success', T(1));
  assert.equal(run({ to: 'staging', deployments: [api, d('Production \u2013 qa-studio', 'failure', T(2))] }).allowed, true);
  assert.equal(run({ to: 'staging', deployments: [d('Production \u2013 qa-studio', 'success', T(1))] }).reason, 'not yet in qa');
});
test('a failing qa-api after its success still blocks', () => {
  const r = run({ to: 'staging', deployments: [d('Production \u2013 qa-api', 'success', T(1)), d('Production \u2013 qa-api', 'failure', T(2))] });
  assert.equal(r.reason, 'failed in qa');
});
test('an unrelated Vercel project is ignored', () => {
  assert.equal(run({ to: 'staging', deployments: [d('Production \u2013 marketing-site', 'success', T(1))] }).reason, 'not yet in qa');
});
test('AWS-style names count for staging and prod', () => {
  assert.equal(run({ to: 'prod', deployments: [d('stg', 'success', T(1))] }).allowed, true);
  assert.equal(run({ to: 'prod', deployments: [d('production', 'success', T(1))] }).allowed, false);
});

// FR-004: a feature-branch Preview deployment is not "in qa" / "in dev"
test('a feature-branch Preview success of qa-api / dev-api is refused: not yet in qa / dev', () => {
  assert.deepEqual(run({ to: 'staging', ref: 'feature/x', deployments: [d('Preview \u2013 qa-api', 'success', T(1), SHA, 'feature/x')] }), { allowed: false, reason: 'not yet in qa' });
  assert.equal(run({ to: 'staging', deployments: [d('Preview - qa-api', 'success', T(1))] }).reason, 'not yet in qa');
  assert.equal(run({ to: 'qa', deployments: [d('Preview \u2013 dev-api', 'success', T(1))] }).reason, 'not yet in dev');
});

// ---- the CLI exit code (what promote.yml sees) ----
const CLI = process.env.PROMOTE_CHECK_SCRIPT ?? new URL('./promote-check.mjs', import.meta.url).pathname;
function cli(to, deployments) {
  const dir = mkdtempSync(join(tmpdir(), 'promote-cli-'));
  const dep = join(dir, 'deployments.json'); const out = join(dir, 'out.txt');
  writeFileSync(dep, JSON.stringify(deployments)); writeFileSync(out, '');
  const r = spawnSync(process.execPath, [CLI, dep], { env: { PATH: process.env.PATH, TO: to, COMMIT: SHA, REF: 'main', GITHUB_OUTPUT: out }, encoding: 'utf8' });
  return { status: r.status, out: readFileSync(out, 'utf8') };
}
test('CLI: a refused promotion exits 1 and writes allowed=false and the reason', () => {
  const r = cli('staging', []);
  assert.equal(r.status, 1);
  assert.match(r.out, /^allowed=false$/m);
  assert.match(r.out, /^reason=not yet in qa$/m);
});
test('CLI: an allowed promotion exits 0 and writes allowed=true', () => {
  const r = cli('staging', [d('qa', 'success', T(1))]);
  assert.equal(r.status, 0);
  assert.match(r.out, /^allowed=true$/m);
});

// ---- P4: the hotfix escape needs the branch, the commit and main ----
test('hotfix: each missing condition refuses and is named', () => {
  const names = { branchExists: /does not exist/, containsCommit: /does not contain the commit/, mainIsAncestor: /main is not an ancestor/ };
  for (const k of Object.keys(names)) {
    const r = run({ to: 'staging', ref: 'hotfix/x', hotfix: { ...OKHOT, [k]: false } });
    assert.equal(r.allowed, false, k);
    assert.match(r.reason, names[k], k);
  }
  assert.equal(run({ to: 'staging', ref: 'hotfix/x', hotfix: undefined }).allowed, false);
  assert.equal(run({ to: 'staging', ref: 'hotfix/x' }).allowed, true);
});

// ---- T041: data-shape rule ----
test('touchesDataShape sees keys.ts and the table definitions only', () => {
  for (const f of ['apps/api/src/db/ddb/keys.ts', 'apps/api/infra/tables.yaml', 'apps/api/infra/stack.json', 'apps/api/infra/free-stack.json']) {
    assert.equal(touchesDataShape(['README.md', f]), true, f);
  }
  assert.equal(touchesDataShape(['apps/api/src/db/ddb/other.ts', 'apps/api/infra/stack.json.bak']), false);
  assert.equal(touchesDataShape([]), false);
  assert.equal(touchesDataShape(undefined), false);
});
test('a data-shape change needs backward_compatible and a reason', () => {
  const changedFiles = ['apps/api/src/db/ddb/keys.ts'];
  const dep = [d('qa', 'success', T(1))];
  assert.match(run({ to: 'staging', deployments: dep, changedFiles }).reason, /backward_compatible/);
  assert.equal(run({ to: 'staging', deployments: dep, changedFiles, backwardCompatible: true }).allowed, false);
  assert.equal(run({ to: 'staging', deployments: dep, changedFiles, backwardCompatible: true, compatReason: 'adds a GSI only' }).allowed, true);
  assert.equal(run({ to: 'staging', ref: 'hotfix/x', changedFiles }).allowed, false);
  assert.equal(run({ to: 'staging', deployments: dep, changedFiles: ['apps/api/src/x.ts'] }).allowed, true);
});

// ---- workflow guards ----
const WF = process.env.WORKFLOW_PATH ?? new URL('../.github/workflows/promote.yml', import.meta.url).pathname;
const present = existsSync(WF);
const skip = !present && 'promote.yml is private-repo only (not in the mirror)';
const text = present ? readFileSync(WF, 'utf8') : '';
const code = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

test('promote.yml starts only with workflow_dispatch', { skip }, () => {
  const on = code.match(/^on:\s*\n((?:[ \t]+.*\n|\n)*)/m);
  assert.ok(on, 'no on: block');
  const triggers = [...on[1].matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(triggers, ['workflow_dispatch']);
  assert.doesNotMatch(code, /\b(push|pull_request|pull_request_target|schedule|workflow_run):/);
});
test('promote.yml pins every uses: to a 40-hex commit sha', { skip }, () => {
  const uses = [...code.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length > 0, 'no uses: found');
  for (const u of uses) assert.match(u, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `not pinned to a sha: ${u}`);
});
test('promote.yml has no AWS sign-in and no secrets', { skip }, () => {
  assert.doesNotMatch(text, /aws-actions\//);
  assert.doesNotMatch(text, /AWS_/);
  assert.doesNotMatch(code, /secrets\.(?!GITHUB_TOKEN\b)/);
});
test('promote.yml checks out full history and passes the hotfix facts and changed files to the CLI', { skip }, () => {
  assert.match(code, /fetch-depth:\s*0/);
  for (const w of ['merge-base --is-ancestor', 'branch -r --contains', 'git diff --name-only', 'CHANGED_FILES_FILE', 'BACKWARD_COMPATIBLE']) {
    assert.ok(code.includes(w), `missing ${w}`);
  }
});
