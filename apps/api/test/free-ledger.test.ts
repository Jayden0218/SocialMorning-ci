// M30 T014: every billable resource of the free dev/qa environments has a row in docs/environments.md (the free ledger).
/**
 * docs/ is never in the public CI mirror, so there the page is missing and the whole file is SKIPPED, visibly (node:test prints
 * "# SKIP"). Set FREE_LEDGER_PAGE to point the check at another copy of the page (the RED probe uses a copy with a row removed).
 * EVERY resource type in the template is billable and needs a ledger row, unless it is on FREE_TYPES below (P3: a new type added
 * to the template is guarded by default). The names come from the Fn::Sub strings with Env = each AllowedValue; a resource with
 * no Fn::Sub name needs a row named by its logical id. FREE_STACK_TEMPLATE points the check at another copy of the template
 * (the RED probe adds a KMS key / SQS queue to a copy). The four Vercel projects come from docs/runbooks/free-envs.md when it exists
 * (backticked dev-api / qa-api / dev-studio / qa-studio), otherwise from the fixed list.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Json = any;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PAGE = process.env['FREE_LEDGER_PAGE'] ?? `${ROOT}docs/environments.md`;
const RUNBOOK = `${ROOT}docs/runbooks/free-envs.md`;
const TEMPLATE = process.env['FREE_STACK_TEMPLATE'] ?? fileURLToPath(new URL('../infra/free-stack.json', import.meta.url));
const template: Json = JSON.parse(readFileSync(TEMPLATE, 'utf8'));
/**
 * The only types that cost nothing and so need no ledger row. Each reason is on the provider's own page:
 * - AWS::IAM::ManagedPolicy: IAM "is offered at no additional charge" (https://aws.amazon.com/iam/)
 * - AWS::Lambda::EventSourceMapping: no charge of its own; the stream reads are inside DynamoDB's 2.5 M free stream reads (R1) and the
 *   invocations inside Lambda's free tier (R2)
 * - AWS::Lambda::EventInvokeConfig: configuration of a function, no charge of its own (https://aws.amazon.com/lambda/pricing/)
 * - AWS::Lambda::Permission: a resource policy statement, no charge (https://aws.amazon.com/lambda/pricing/)
 * - AWS::Lambda::Url: "Function URLs ... no additional charge" beyond the invocations (https://aws.amazon.com/lambda/pricing/)
 * Anything else (KMS, SQS, SNS, alarms, ...) is billable until proven otherwise.
 */
export const FREE_TYPES = [
  'AWS::IAM::ManagedPolicy',
  'AWS::Lambda::EventSourceMapping',
  'AWS::Lambda::EventInvokeConfig',
  'AWS::Lambda::Permission',
  'AWS::Lambda::Url',
];
const FIXED_VERCEL = ['dev-api', 'qa-api', 'dev-studio', 'qa-studio'];
const skip = existsSync(PAGE) ? false : `docs/environments.md not found at ${PAGE} (the public CI mirror has no docs/): free ledger NOT CHECKED here`;

/** The rows of the "free ledger" section: first-column backticked name and the Source + date cell. */
export function ledgerRows(text: string): { name: string; source: string }[] {
  const start = text.search(/^## The free ledger/m);
  assert.ok(start >= 0, 'no "## The free ledger" section');
  const rest = text.slice(start).split('\n').slice(1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const rows: { name: string; source: string }[] = [];
  for (const l of end < 0 ? rest : rest.slice(0, end)) {
    if (!l.startsWith('|')) continue;
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    const m = /^`([^`]+)`$/.exec(cells[0] ?? '');
    if (m) rows.push({ name: m[1]!, source: cells[4] ?? '' });
  }
  return rows;
}

/** Every billable physical name in the template, for each Env value (a resource with no Fn::Sub name: its logical id). */
export function billableNames(t: Json = template): string[] {
  const envs: string[] = t.Parameters.Env.AllowedValues;
  const out: string[] = [];
  for (const [id, r] of Object.entries(t.Resources as Record<string, Json>)) {
    if (FREE_TYPES.includes(r.Type)) continue;
    const p = r.Properties ?? {};
    const raw: unknown = (p.TableName ?? p.FunctionName ?? p.Name ?? p.LogGroupName ?? p.QueueName ?? p.TopicName ?? p.AlarmName)?.['Fn::Sub'];
    if (typeof raw === 'string') for (const env of envs) out.push(raw.replaceAll('${Env}', env));
    else out.push(id);
  }
  return out;
}

/** The billable types present, for the failure message. */
const billableTypes = (t: Json = template): Map<string, string> =>
  new Map(Object.entries(t.Resources as Record<string, Json>).filter(([, r]) => !FREE_TYPES.includes(r.Type)).map(([id, r]) => [id, r.Type]));

const vercelNames = (): string[] => {
  if (!existsSync(RUNBOOK)) return FIXED_VERCEL;
  const found = new Set([...readFileSync(RUNBOOK, 'utf8').matchAll(/`((?:dev|qa)-(?:api|studio))`/g)].map((m) => m[1]!));
  return found.size ? [...new Set([...FIXED_VERCEL, ...found])] : FIXED_VERCEL;
};

test('billableNames expands every table, function, schedule and log group for dev and qa', { skip }, () => {
  const names = billableNames();
  assert.equal(names.length, 14, names.join(', '));
  assert.ok(names.includes('dev-main') && names.includes('qa-jobs-hourly') && names.includes('/aws/lambda/dev-worker'));
});

test('every billable resource of free-stack.json has a ledger row', { skip }, () => {
  const rows = ledgerRows(readFileSync(PAGE, 'utf8')).map((r) => r.name);
  const missing = billableNames().filter((n) => !rows.includes(n));
  const types = [...billableTypes()].map(([id, ty]) => `${id}=${ty}`).join(', ');
  assert.deepEqual(missing, [], `add ledger rows to docs/environments.md for: ${missing.join(', ')} (billable types: ${types}; free types are only ${FREE_TYPES.join(', ')})`);
});

test('every Vercel project (dev-api qa-api dev-studio qa-studio) has a ledger row', { skip }, () => {
  const rows = ledgerRows(readFileSync(PAGE, 'utf8')).map((r) => r.name);
  const missing = vercelNames().filter((n) => !rows.includes(n));
  assert.deepEqual(missing, [], `add ledger rows to docs/environments.md for: ${missing.join(', ')}`);
});

test('every ledger row names a source and a 2026 date', { skip }, () => {
  const rows = ledgerRows(readFileSync(PAGE, 'utf8'));
  assert.ok(rows.length >= 18, `${rows.length} rows`);
  let last = '';
  for (const r of rows) {
    assert.ok(r.source.length > 0, `${r.name}: empty Source + date`);
    // "same" repeats the row above (the page's own shorthand), so the row above must itself carry the date.
    const effective = /^same$/i.test(r.source) ? last : r.source;
    assert.match(effective, /2026/, `${r.name}: Source + date must contain a 2026 date (got "${r.source}")`);
    last = effective;
  }
});
