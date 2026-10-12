// M27 T038 (G-DP1, G-DP2): the two AWS deploy workflows start only by hand, hold the only reference to the deploy role, and prod checks staging first.
/**
 * The workflows live in the PRIVATE repo's .github/workflows/ and are never in the public CI mirror, so in the mirror this test finds
 * none and only checks the other half (nothing under ci/workflows/ is a deploy workflow or touches AWS sign-in).
 * The YAML is read as text: `on:` is the first top-level block, its keys are the two-space-indented names under it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PRIVATE = join(ROOT, '.github/workflows');
const MIRRORED = join(ROOT, 'ci/workflows');
const DEPLOY = ['deploy-staging.yml', 'deploy-prod.yml'];
const present = DEPLOY.every((f) => existsSync(join(PRIVATE, f)));
const read = (dir: string, f: string) => readFileSync(join(dir, f), 'utf8');
const yml = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.yml')) : []);

/** The keys under the top-level `on:`. */
function triggers(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  assert.ok(start >= 0, 'no top-level `on:` block');
  const keys: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\S/.test(l)) break;
    const m = /^ {2}([A-Za-z_]+):/.exec(l);
    if (m) keys.push(m[1]!);
  }
  return keys;
}

test('nothing under ci/workflows/ (the public mirror) is a deploy workflow or signs in to AWS', () => {
  for (const f of yml(MIRRORED)) {
    assert.ok(!f.startsWith('deploy-'), `${f} would be copied to the public mirror`);
    const t = read(MIRRORED, f);
    assert.ok(!/AWS_DEPLOY_ROLE_ARN|configure-aws-credentials|id-token:\s*write/.test(t), `${f} must not sign in to AWS`);
  }
});

test('only the two deploy workflows mention the deploy role', { skip: !present && 'deploy workflows are private-repo only (not in the mirror)' }, () => {
  for (const dir of [PRIVATE, MIRRORED]) {
    for (const f of yml(dir)) {
      const mentions = /AWS_DEPLOY_ROLE_ARN/.test(read(dir, f));
      assert.equal(mentions, dir === PRIVATE && DEPLOY.includes(f), `${f}: AWS_DEPLOY_ROLE_ARN ${mentions ? 'is' : 'is not'} mentioned`);
    }
  }
});

test('G-DP1: both deploy workflows start only with workflow_dispatch', { skip: !present && 'private-repo only' }, () => {
  for (const f of DEPLOY) assert.deepEqual(triggers(read(PRIVATE, f)), ['workflow_dispatch'], `${f} triggers`);
});

test('the AWS sign-in action is pinned to a full commit SHA', { skip: !present && 'private-repo only' }, () => {
  for (const f of DEPLOY) {
    const uses = [...read(PRIVATE, f).matchAll(/aws-actions\/configure-aws-credentials@(\S+)/g)].map((m) => m[1]!);
    assert.ok(uses.length >= 1, `${f} does not sign in`);
    for (const ref of uses) assert.match(ref, /^[0-9a-f]{40}$/, `${f}: ${ref} is not a 40-hex commit SHA`);
  }
});

test('G-DP2: prod checks that staging ran first, and deploys only after it', { skip: !present && 'private-repo only' }, () => {
  const prod = read(PRIVATE, 'deploy-prod.yml');
  assert.match(prod, /^ {2}check-staging:/m, 'no check-staging job');
  assert.match(prod, /needs: check-staging/, 'the deploy job does not wait for check-staging');
  assert.match(prod, /override_reason/);
  assert.match(prod, /deploy-staging\.yml\/runs\?head_sha=/, 'check-staging does not ask for the staging run of this commit');
  assert.ok(!/check-staging/.test(read(PRIVATE, 'deploy-staging.yml')), 'staging has no such gate');
});

test('each deploy workflow uses its own environment only (names, secrets, role pair)', { skip: !present && 'private-repo only' }, () => {
  const code = (t: string) => t.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'); // comments may name the owner's role
  const stg = code(read(PRIVATE, 'deploy-staging.yml'));
  const prod = code(read(PRIVATE, 'deploy-prod.yml'));
  assert.ok(/ENV_NAME: stg/.test(stg) && /STACK: stg-api-stack/.test(stg));
  assert.ok(/ENV_NAME: sm/.test(prod) && /STACK: sm-api-stack/.test(prod));
  assert.ok(!/secrets\.PROD_|\bsm-/.test(stg), 'staging reaches for a production secret or name');
  assert.ok(!/secrets\.STG_|\bstg-/.test(prod), 'prod reaches for a staging secret or name');
  assert.ok(/APP_ENV":"staging"/.test(stg) && /APP_ENV":"prod"/.test(prod));
});
