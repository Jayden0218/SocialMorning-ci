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

test('M28 US3: prod passes the alarm email from PROD_ALERT_EMAIL and reports whether it is confirmed; staging passes none', { skip: !present && 'private-repo only' }, () => {
  const prod = read(PRIVATE, 'deploy-prod.yml');
  const stg = read(PRIVATE, 'deploy-staging.yml');
  assert.match(prod, /ALERT_EMAIL_PARAM: \$\{\{ secrets\.PROD_ALERT_EMAIL \}\}/);
  assert.match(prod, /ParameterKey=AlertEmail,ParameterValue=\$ALERT_EMAIL_PARAM/);
  assert.match(prod, /alarm email: \$ALARM_EMAIL/);
  for (const word of ['confirmed', 'NOT CONFIRMED', 'NOT SET']) assert.ok(prod.includes(word), `summary word ${word}`);
  assert.match(prod, /sns list-subscriptions-by-topic/);
  assert.match(stg, /ParameterKey=AlertEmail,ParameterValue="/, 'staging passes an empty address');
  assert.ok(!/secrets\.PROD_ALERT_EMAIL/.test(stg));
});

// M28 US4: the nightly DynamoDB backup is private-repo only, like the deploy workflows.
const BACKUP = 'backup-ddb.yml';
const backupPresent = existsSync(join(PRIVATE, BACKUP));
const PUSH_CI = join(ROOT, 'scripts/push-ci.sh');

test('M28 US4: backup-ddb.yml is never in the public mirror: not in ci/workflows/, and push-ci.sh refuses it twice', () => {
  assert.ok(!existsSync(join(MIRRORED, BACKUP)), `${BACKUP} must not be under ci/workflows/ (it is copied to the public mirror)`);
  if (!existsSync(PUSH_CI)) return; // the mirror has no scripts/push-ci.sh
  const sh = readFileSync(PUSH_CI, 'utf8');
  assert.match(sh, /case "\$\(basename "\$w"\)" in backup\.yml\|backup-ddb\.yml\)/, 'push-ci.sh does not refuse a backup-ddb.yml in ci/workflows/');
  assert.match(sh, /for b in backup\.yml backup-ddb\.yml; do\s+if \[ -e "\$MIRROR\/\.github\/workflows\/\$b" \]/, 'push-ci.sh does not check the mirror tree for backup-ddb.yml');
});

test('M28 US4: backup-ddb.yml runs nightly and by hand, signs in with the backup role pinned to a commit, encrypts with age, keeps 30 days, and preflights', { skip: !backupPresent && 'private-repo only' }, () => {
  const t = read(PRIVATE, BACKUP);
  assert.deepEqual(triggers(t), ['schedule', 'workflow_dispatch']);
  assert.match(t, /cron: '30 19 \* \* \*'/);
  assert.match(t, /options: \[sm, stg\]/);
  assert.match(t, /role-to-assume: \$\{\{ env\.AWS_BACKUP_ROLE_ARN \}\}/);
  assert.match(t, /AWS_BACKUP_ROLE_ARN: \$\{\{ vars\.AWS_BACKUP_ROLE_ARN \}\}/);
  assert.ok(!/AWS_DEPLOY_ROLE_ARN/.test(t), 'the backup never uses the deploy role');
  for (const ref of [...t.matchAll(/aws-actions\/configure-aws-credentials@(\S+)/g)].map((m) => m[1]!)) assert.match(ref, /^[0-9a-f]{40}$/, `${ref} is not a 40-hex commit SHA`);
  assert.match(t, /age --encrypt --recipient "\$BACKUP_AGE_RECIPIENT"/);
  assert.match(t, /retention-days: 30/);
  // The preflight refuses (exit 1) without the role or the recipient, and runs before anything is installed or signed in.
  const pre = t.indexOf('- name: preflight');
  assert.ok(pre > 0 && pre < t.indexOf('npm ci') && pre < t.indexOf('configure-aws-credentials@e'), 'the preflight must come first');
  assert.match(t, /backup refused: the variable AWS_BACKUP_ROLE_ARN is not set/);
  assert.match(t, /backup refused: the variable BACKUP_AGE_RECIPIENT .* is not set/);
  assert.match(t, /\[ "\$fail" -eq 0 \] \|\| exit 1/);
});

// M28 US6 (G-M28-SECRET): `secrets_from: ssm` keeps every secret value out of the function environment. The step's own bash is run here.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/** The script of the step that sets the functions' environment, cut off before the first AWS call (`for pair in`), de-indented. */
function envScript(text: string): string {
  const at = text.indexOf('- name: upload the code and set the environment of both functions');
  assert.ok(at > 0, 'no env step');
  const run = text.indexOf('run: |\n', at) + 'run: |\n'.length;
  const body = text.slice(run, text.indexOf('          for pair in', run));
  return body.split('\n').map((l) => l.replace(/^ {10}/, '')).join('\n');
}

const SECRET_NAMES = ['SESSION_PEPPER', 'PEPPER_NEXT', 'JOB_TOKEN', 'CURSOR_SECRET', 'GMAIL_APP_PASSWORD', 'GROQ_API_KEY', 'BLOB_READ_WRITE_TOKEN', 'EPISODES_READ_WRITE_TOKEN', 'IMAGES_READ_WRITE_TOKEN'];
const PLAIN_NAMES = ['GMAIL_USER', 'OWNER_LISTENER_ID', 'APPEALS_EMAIL', 'ALERT_EMAIL'];

/** Runs the script with every name set to a recognisable made-up value; returns the two JSON files it writes. */
function runEnvStep(file: string, secretsFrom: 'github' | 'ssm'): { api: Record<string, string>; worker: Record<string, string> } | { failed: string } {
  const dir = mkdtempSync(join(tmpdir(), 'm28-env-'));
  try {
    const env: Record<string, string> = { PATH: process.env['PATH'] ?? '', RUNNER_TEMP: dir, ENV_NAME: file.includes('prod') ? 'sm' : 'stg', SECRETS_FROM: secretsFrom };
    
    for (const n of SECRET_NAMES) env[n] = `value-of-${n}`; // worst case: even if the step were handed them under ssm, the script must not forward them
    for (const n of PLAIN_NAMES) env[n] = `value-of-${n}`;
    const script = `${envScript(read(PRIVATE, file))}\nprintf '%s' "$(cat "$RUNNER_TEMP/lambda-env-api.json")"; printf '\\n===\\n'; printf '%s' "$(cat "$RUNNER_TEMP/lambda-env-worker.json")"`;
    let out: string;
    try { out = execFileSync('bash', ['-c', script], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return { failed: String((e as { stderr?: string }).stderr) }; }
    const [a, w] = out.split('\n===\n');
    return { api: JSON.parse(a!).Variables, worker: JSON.parse(w!).Variables };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

for (const f of DEPLOY) {
  test(`M28 US6 G-M28-SECRET: ${f} with secrets_from=ssm puts no secret value in the environment JSON; only SECRETS_PATH and the non-secret names`, { skip: !present && 'private-repo only' }, () => {
    const r = runEnvStep(f, 'ssm');
    assert.ok(!('failed' in r), 'failed' in r ? r.failed : '');
    const env = f.includes('prod') ? 'sm' : 'stg';
    const keys = Object.keys(r.api).sort();
    assert.deepEqual(keys, ['APP_ENV', 'DATA_BACKEND', 'DDB_TABLE_PREFIX', 'SECRETS_PATH', ...PLAIN_NAMES].sort());
    assert.equal(r.api['SECRETS_PATH'], `/${env}/api/`);
    for (const v of Object.values(r.api)) assert.ok(!SECRET_NAMES.some((n) => v.includes(`value-of-${n}`)), 'a secret value is in the JSON');
    for (const k of SECRET_NAMES) assert.ok(!(k in r.api) && !(k in r.worker), `${k} must not be in the function environment`);
    assert.deepEqual(r.worker, { ...r.api, SECRETS_REQUIRED: 'JOB_TOKEN' }, 'the worker also requires JOB_TOKEN');
  });

  test(`M28 US6: ${f} with secrets_from=github is today's environment plus PEPPER_NEXT (the M25 rotation works on AWS), and SECRETS_PATH is absent`, { skip: !present && 'private-repo only' }, () => {
    const r = runEnvStep(f, 'github');
    assert.ok(!('failed' in r), 'failed' in r ? r.failed : '');
    for (const k of [...SECRET_NAMES, ...PLAIN_NAMES]) assert.equal(r.api[k], `value-of-${k}`, `${k} reaches the function`);
    assert.equal('SECRETS_PATH' in r.api, false, 'without SECRETS_PATH the Lambda reads its environment');
    assert.deepEqual(r.worker, r.api);
  });

  test(`M28 US6: ${f} takes the input secrets_from (github | ssm, default github), withholds secrets from the step under ssm, and says which in the summary`, { skip: !present && 'private-repo only' }, () => {
    const t = read(PRIVATE, f);
    assert.match(t, /secrets_from:\n(?: {8}.*\n)*? {8}options: \[github, ssm\]\n {8}default: github/);
    for (const n of SECRET_NAMES) assert.match(t, new RegExp(`${n}: \\$\\{\\{ inputs\\.secrets_from == 'github' && secrets\\.\\w+_${n} \\|\\| '' \\}\\}`), `${n} must be withheld under ssm`);
    assert.match(t, /echo "- secrets: \$SECRETS_FROM"/);
  });
}

// M32 T020 (review B1): production deploys wait for the GitHub Environment `production` (required reviewer, its own secrets).
test('M32 B1: every job of deploy-prod.yml that signs in to AWS declares `environment: production`', { skip: !present && 'private-repo only' }, () => {
  const text = read(PRIVATE, 'deploy-prod.yml');
  const jobsAt = text.split('\n').findIndex((l) => /^jobs:\s*$/.test(l));
  assert.ok(jobsAt >= 0, 'no jobs: block');
  const jobs: Record<string, string[]> = {};
  let cur = '';
  for (const l of text.split('\n').slice(jobsAt + 1)) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
    if (m) { cur = m[1]!; jobs[cur] = []; } else if (cur) jobs[cur]!.push(l);
  }
  const signers = Object.entries(jobs).filter(([, b]) => b.some((l) => /configure-aws-credentials/.test(l)));
  assert.ok(signers.length >= 1, 'no job signs in to AWS');
  for (const [name, body] of signers) {
    assert.ok(body.some((l) => /^ {4}environment:\s*production\s*$/.test(l)), `job ${name} has no \`environment: production\``);
  }
});
