// M30 T013: the free dev/qa template (infra/free-stack.json) stays inside the free account's 25 RCU / 25 WCU, checked without AWS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freeStackText } from '../infra/build-free-stack.ts';

type Json = any;
const committed = readFileSync(fileURLToPath(new URL('../infra/free-stack.json', import.meta.url)), 'utf8');
const template: Json = JSON.parse(committed);
const ENVS: string[] = template.Parameters.Env.AllowedValues;
const res = (type: string): [string, Json][] => Object.entries(template.Resources as Record<string, Json>).filter(([, r]) => r.Type === type);

/** The units one deployment of the template provisions: every table plus every GSI. */
function units(t: Json = template): { rcu: number; wcu: number } {
  let rcu = 0, wcu = 0;
  for (const r of Object.values(t.Resources as Record<string, Json>)) {
    if (r.Type !== 'AWS::DynamoDB::Table') continue;
    for (const pt of [r.Properties.ProvisionedThroughput, ...(r.Properties.GlobalSecondaryIndexes ?? []).map((g: Json) => g.ProvisionedThroughput)]) {
      rcu += pt?.ReadCapacityUnits ?? 0; wcu += pt?.WriteCapacityUnits ?? 0;
    }
  }
  return { rcu, wcu };
}

test('(a) the committed free-stack.json equals a fresh build', () => {
  assert.equal(committed, freeStackText(), 'run `npx tsx infra/build-free-stack.ts` in apps/api and commit free-stack.json');
});

test('(b) both environments together stay at or under 25 RCU and 25 WCU (24 / 24 today)', () => {
  assert.deepEqual(ENVS, ['dev', 'qa']);
  const u = units();
  assert.deepEqual(u, { rcu: 12, wcu: 12 }, 'one environment');
  assert.deepEqual({ rcu: u.rcu * ENVS.length, wcu: u.wcu * ENVS.length }, { rcu: 24, wcu: 24 });
  assert.ok(u.rcu * ENVS.length <= 25 && u.wcu * ENVS.length <= 25, 'free account allowance is 25 / 25 in total');
  assert.equal(res('AWS::DynamoDB::Table').length, 3);
  const gsi = res('AWS::DynamoDB::Table').reduce((n, [, r]) => n + (r.Properties.GlobalSecondaryIndexes?.length ?? 0), 0);
  assert.equal(gsi, 7, '6 on main + 1 on events');
});

test('(c) no on-demand billing and no auto scaling anywhere', () => {
  const text = JSON.stringify(template);
  assert.ok(!text.includes('PAY_PER_REQUEST'));
  for (const [id, r] of Object.entries(template.Resources as Record<string, Json>)) assert.ok(!r.Type.startsWith('AWS::ApplicationAutoScaling'), `${id} is auto scaling`);
  for (const [id, r] of res('AWS::DynamoDB::Table')) assert.equal(r.Properties.BillingMode, 'PROVISIONED', id);
});

test('(d) PITR off, no deletion protection, tables retained on delete, TTL kept, Stream on main only', () => {
  for (const [id, r] of res('AWS::DynamoDB::Table')) {
    assert.equal(r.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, false, `${id} PITR`);
    assert.equal(r.Properties.DeletionProtectionEnabled, false, `${id} deletion protection`);
    assert.equal(r.DeletionPolicy, 'Retain'); assert.equal(r.UpdateReplacePolicy, 'Retain');
    assert.deepEqual(r.Properties.TimeToLiveSpecification, { AttributeName: 'ttl', Enabled: true });
    assert.equal(!!r.Properties.StreamSpecification, id === 'Main', `${id} stream`);
  }
});

test('(e) every physical name resolves to dev-* or qa-* only', () => {
  const text = JSON.stringify(template.Resources);
  const names = [...text.matchAll(/"(?:TableName|FunctionName|Name|LogGroupName|ManagedPolicyName)":\{"Fn::Sub":"([^"]+)"\}/g)].map((m) => m[1]!);
  assert.equal(names.length, 8, `3 tables + worker + log group + 2 schedules + policy; found ${names.join(', ')}`);
  for (const env of ENVS) for (const raw of names) {
    const n = raw.replaceAll('${Env}', env).replace(/^\/aws\/lambda\//, '');
    assert.ok(n.startsWith(`${env}-`), `${n} must start ${env}-`);
  }
  assert.ok(!/"(?:stg|sm)-/.test(text) && !text.includes('"sm-'), 'no staging or prod name');
});

test('(f) the worker has no provisioned concurrency, no API function exists, the log group keeps 3 days', () => {
  const fns = res('AWS::Lambda::Function');
  assert.deepEqual(fns.map(([id]) => id), ['Worker']);
  assert.equal(fns[0]![1].Properties.ReservedConcurrentExecutions, undefined);
  const text = JSON.stringify(template);
  assert.ok(!/ProvisionedConcurrency/.test(text) && !text.includes('AWS::Lambda::Url'));
  assert.equal(res('AWS::Logs::LogGroup')[0]![1].Properties.RetentionInDays, 3);
  for (const t of ['AWS::CloudWatch::Alarm', 'AWS::SQS::Queue', 'AWS::SNS::Topic']) assert.equal(res(t).length, 0, t);
  assert.deepEqual(res('AWS::Scheduler::Schedule').map(([, r]) => r.Properties.ScheduleExpression).sort(), ['rate(1 hour)', 'rate(1 minute)']);
  assert.match(res('AWS::Lambda::EventSourceMapping')[0]![1].Properties.FilterCriteria.Filters[0].Pattern, /OUTBOX#/);
});

test('(f2) the worker Timeout is at most 60 seconds (P5; it was 300)', () => {
  const [[, w]] = res('AWS::Lambda::Function') as [[string, Json]];
  assert.ok(w.Properties.Timeout <= 60, `worker Timeout ${w.Properties.Timeout} s is over 60`);
});

test('(g) the Vercel API policy: data actions only, on the three tables and their indexes, no * resource', () => {
  const [[, pol]] = res('AWS::IAM::ManagedPolicy') as [[string, Json]];
  const statements: Json[] = pol.Properties.PolicyDocument.Statement;
  assert.ok(statements.length > 0);
  const ok = /^dynamodb:(GetItem|PutItem|UpdateItem|DeleteItem|ConditionCheckItem|Query|Scan|BatchGetItem|BatchWriteItem|DescribeTable)$/;
  const arns: string[] = [];
  for (const s of statements) {
    assert.equal(s.Effect, 'Allow');
    for (const a of [s.Action].flat()) assert.match(a, ok, `action ${a}`);
    for (const r of [s.Resource].flat()) {
      assert.notEqual(r, '*'); assert.ok(typeof r === 'object', 'resources are table ARNs, not literals');
      arns.push(JSON.stringify(r));
    }
  }
  assert.ok(!JSON.stringify(pol).includes('"*"'), 'no wildcard anywhere');
  for (const t of ['Main', 'Events', 'Cache']) {
    assert.ok(arns.includes(JSON.stringify({ 'Fn::GetAtt': [t, 'Arn'] })), `${t} table`);
    assert.ok(arns.includes(JSON.stringify({ 'Fn::Sub': `\${${t}.Arn}/index/*` })), `${t} indexes`);
  }
  assert.equal(arns.length, 6, 'exactly the three tables and their /index/*');
  assert.equal(pol.Properties.ManagedPolicyName['Fn::Sub'], '${Env}-vercel-api-ddb');
});

test('(h) outputs name the tables, their ARNs and the policy', () => {
  for (const k of ['MainTableName', 'EventsTableName', 'CacheTableName', 'MainTableArn', 'EventsTableArn', 'CacheTableArn', 'VercelApiPolicyArn']) assert.ok(template.Outputs[k], k);
});

test('(RED probe) the unit counter notices one index at 2/2', () => {
  const t = structuredClone(template);
  t.Resources.Main.Properties.GlobalSecondaryIndexes[0].ProvisionedThroughput = { ReadCapacityUnits: 2, WriteCapacityUnits: 2 };
  assert.deepEqual(units(t), { rcu: 13, wcu: 13 });
  assert.ok(units(t).rcu * ENVS.length > 25);
});
