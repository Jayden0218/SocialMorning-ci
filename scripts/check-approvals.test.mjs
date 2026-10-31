// M30 T031/T032: the approval-list check. Run: node --test scripts/check-approvals.test.mjs
// The CLI guards run the real script on a temp copy of the page (CHECK_APPROVALS_PAGE), so a red run never touches docs/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stackTypes, parseApprovalRows, isApproved, check, FREE_TYPES } from './check-approvals.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'check-approvals.mjs');
const PAGE = join(HERE, '../docs/environments.md');
const STACK = join(HERE, '../apps/api/infra/stack.json');
const haveDocs = existsSync(PAGE) && existsSync(STACK);

const page = (rows) => `# x\n\n## The approval list (staging and prod)\n\n| Resource type | Used for | Cost | Approved by | Date |\n|---|---|---|---|---|\n${rows.join('\n')}\n`;
const row = (t, by = '—', date = '—') => `| \`${t}\` | used | cost | ${by} | ${date} |`;
const stack = (types) => JSON.stringify({ Parameters: { Env: { Type: 'String' } }, Resources: Object.fromEntries(types.map((t, i) => [`R${i}`, { Type: t }])) });

function cli(pageText, stackText, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'appr-'));
  try {
    const p = join(dir, 'p.md'), s = join(dir, 's.json');
    if (pageText !== null) writeFileSync(p, pageText);
    writeFileSync(s, stackText);
    const r = spawnSync('node', [SCRIPT, ...args], { env: { PATH: process.env.PATH, CHECK_APPROVALS_PAGE: p, CHECK_APPROVALS_STACK: s }, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('stackTypes: resource types only (Parameters are not resources), de-duplicated', () => {
  assert.deepEqual(stackTypes(stack(['AWS::SQS::Queue', 'AWS::SQS::Queue', 'AWS::SNS::Topic'])), ['AWS::SNS::Topic', 'AWS::SQS::Queue']);
});
test('parseApprovalRows reads backticked types and the last two cells; other tables are ignored', () => {
  const md = `| \`AWS::Other::Thing\` | before the heading | x | y | z |\n${page([row('AWS::SQS::Queue', 'Jayden', '2026-11-01'), row('AWS::SNS::Topic')])}`;
  assert.deepEqual(parseApprovalRows(md), [{ type: 'AWS::SQS::Queue', approvedBy: 'Jayden', date: '2026-11-01' }, { type: 'AWS::SNS::Topic', approvedBy: '—', date: '—' }]);
});
test('a row is approved only with a real name AND a 20YY-MM-DD date', () => {
  assert.equal(isApproved({ approvedBy: 'Jayden', date: '2026-11-01' }), true);
  for (const [by, d] of [['—', '2026-11-01'], ['', '2026-11-01'], ['-', '2026-11-01'], ['Jayden', '—'], ['Jayden', ''], ['Jayden', '1 Nov'], ['Jayden', '2026-1-1']]) assert.equal(isApproved({ approvedBy: by, date: d }), false, `${by}|${d}`);
});
test('isApproved rejects an impossible calendar date', () => {
  for (const d of ['2026-13-99', '2026-02-30', '2026-00-10', '2026-04-31', '2026-01-00', '2027-02-29']) assert.equal(isApproved({ approvedBy: 'Jayden', date: d }), false, d);
  assert.equal(isApproved({ approvedBy: 'Jayden', date: '2028-02-29' }), true);
});
test('isApproved rejects a name under 2 characters or a filler', () => {
  for (const by of ['J', 'x', 'X', 'tbd', 'TBD', 'todo', 'n/a', 'N/A', 'none', 'None', '-', '\u2014', ' x ']) assert.equal(isApproved({ approvedBy: by, date: '2026-11-01' }), false, by);
  assert.equal(isApproved({ approvedBy: 'Jo', date: '2026-11-01' }), true);
});
test('the free list is exactly the three types without a price', () => {
  assert.deepEqual([...FREE_TYPES].sort(), ['AWS::Lambda::EventInvokeConfig', 'AWS::Lambda::EventSourceMapping', 'AWS::Lambda::Permission']);
});
test('check: a billable type with no row is missing; a free type with no row is fine', () => {
  const c = check(['AWS::SQS::Queue', 'AWS::Lambda::Permission'], []);
  assert.deepEqual(c, { missing: ['AWS::SQS::Queue'], unapproved: [] });
});

test('CLI: every type has a row -> exit 0; a missing row -> exit 1 naming the type', () => {
  const s = stack(['AWS::SQS::Queue', 'AWS::SNS::Topic', 'AWS::Lambda::Permission']);
  assert.equal(cli(page([row('AWS::SQS::Queue'), row('AWS::SNS::Topic')]), s).code, 0);
  const r = cli(page([row('AWS::SQS::Queue')]), s);
  assert.equal(r.code, 1);
  assert.match(r.err, /lacks a row for: AWS::SNS::Topic/);
});
test('CLI: without the page the plain check skips visibly (exit 0); --require-approved refuses (exit 1)', () => {
  const s = stack(['AWS::SQS::Queue']);
  const a = cli(null, s);
  assert.equal(a.code, 0); assert.match(a.out, /^SKIP/);
  assert.equal(cli(null, s, '--require-approved', 'staging').code, 1);
});
test('CLI --require-approved: unapproved row -> exit 1; name + date -> exit 0; remove them again -> exit 1 (the T032 guard)', () => {
  const s = stack(['AWS::SQS::Queue', 'AWS::SNS::Topic']);
  const none = page([row('AWS::SQS::Queue'), row('AWS::SNS::Topic')]);
  const r = cli(none, s, '--require-approved', 'prod');
  assert.equal(r.code, 1); assert.match(r.err, /refused.*AWS::SNS::Topic, AWS::SQS::Queue/);
  const some = page([row('AWS::SQS::Queue', 'Jayden', '2026-11-01'), row('AWS::SNS::Topic')]);
  assert.equal(cli(some, s, '--require-approved', 'prod').code, 1, 'one row still unapproved');
  const all = page([row('AWS::SQS::Queue', 'Jayden', '2026-11-01'), row('AWS::SNS::Topic', 'Jayden', '2026-11-01')]);
  assert.equal(cli(all, s, '--require-approved', 'staging').code, 0);
  assert.equal(cli(all, s).code, 0);
  assert.equal(cli(all.replace('Jayden | 2026-11-01 |\n', '— | — |\n'), s, '--require-approved', 'staging').code, 1);
});
test('CLI: a target other than staging|prod is a usage error', () => {
  assert.equal(cli(page([]), stack([]), '--require-approved', 'dev').code, 2);
});

test('the real page has a row for every billable type of the real stack', { skip: !haveDocs && 'docs/ is absent (public mirror)' }, () => {
  const c = check(stackTypes(readFileSync(STACK, 'utf8')), parseApprovalRows(readFileSync(PAGE, 'utf8')));
  assert.deepEqual(c.missing, []);
});
