// M27 T013: the CloudFormation template (infra/stack.json) rendered for staging and prod, checked without AWS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stackText } from '../infra/build-stack.ts';
import { outbox } from '../src/db/ddb/keys.ts';
import { parseTemplate } from '../src/db/ddb/schema.ts';

type Json = any;
const STACK = fileURLToPath(new URL('../infra/stack.json', import.meta.url));
const TABLES = fileURLToPath(new URL('../infra/tables.yaml', import.meta.url));
const committed = readFileSync(STACK, 'utf8');
const template: Json = JSON.parse(committed);

/** A small resolver: Env, Fn::Sub with ${Env}, Fn::If on IsProd. Other Refs / GetAtts become readable placeholders. */
function resolve(node: Json, env: 'stg' | 'sm'): Json {
  if (Array.isArray(node)) return node.map((n) => resolve(n, env));
  if (node && typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 1) {
      const k = keys[0]!;
      if (k === 'Ref') return node.Ref === 'Env' ? env : `<${node.Ref}>`;
      if (k === 'Fn::Sub') return String(node['Fn::Sub']).replaceAll('${Env}', env);
      if (k === 'Fn::GetAtt') return `<${node['Fn::GetAtt'].join('.')}>`;
      if (k === 'Fn::If') {
        const [cond, yes, no] = node['Fn::If'];
        assert.equal(cond, 'IsProd', 'only the IsProd condition is understood');
        return resolve(env === 'sm' ? yes : no, env);
      }
      if (k === 'Fn::Equals') throw new Error('conditions are not resolved as values');
    }
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolve(v, env)]));
  }
  return node;
}
const render = (env: 'stg' | 'sm') => resolve(template.Resources, env) as Record<string, { Type: string; Properties: Json; DeletionPolicy?: string; UpdateReplacePolicy?: string }>;

test('(a) the committed stack.json equals a fresh build', () => {
  assert.equal(committed, stackText(), 'run `npm run infra:build -w apps/api` and commit stack.json');
});

test('(b) staging names all start stg- and never mention sm-; prod the reverse', () => {
  for (const [env, mine, other] of [['stg', 'stg-', 'sm-'], ['sm', 'sm-', 'stg-']] as const) {
    const text = JSON.stringify(render(env));
    const names = [...text.matchAll(/"(?:TableName|FunctionName|Name|LogGroupName)":"([^"]+)"/g)].map((m) => m[1]!).filter((n) => !n.startsWith('<'));
    assert.ok(names.length === 9, `found ${names.length} names`);
    for (const n of names) assert.ok(n.replace(/^\/aws\/lambda\//, '').startsWith(mine), `${env}: ${n} must start ${mine}`);
    assert.ok(!text.includes(other), `${env} must not mention ${other}`);
  }
});

test('(c) PITR + deletion protection on prod main and events only; cache never; staging none; log retention 14 / 3', () => {
  for (const env of ['stg', 'sm'] as const) {
    const r = render(env);
    for (const id of ['Main', 'Events'] as const) {
      const p = r[id]!.Properties;
      assert.equal(p.DeletionProtectionEnabled, env === 'sm', `${env} ${id} deletion protection`);
      assert.equal(p.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, env === 'sm', `${env} ${id} PITR`);
    }
    assert.equal(r['Cache']!.Properties.DeletionProtectionEnabled, false);
    assert.equal(r['Cache']!.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, false);
    for (const id of ['Main', 'Events', 'Cache']) assert.deepEqual(r[id]!.Properties.TimeToLiveSpecification, { AttributeName: 'ttl', Enabled: true }, `${id} TTL`);
    assert.equal(r['ApiLogs']!.Properties.RetentionInDays, env === 'sm' ? 14 : 3);
    assert.equal(r['WorkerLogs']!.Properties.RetentionInDays, env === 'sm' ? 14 : 3);
  }
});

test('(d) every table keeps its data when the stack is deleted or the table would be replaced', () => {
  for (const env of ['stg', 'sm'] as const) {
    const tables = Object.entries(render(env)).filter(([, r]) => r.Type === 'AWS::DynamoDB::Table');
    assert.equal(tables.length, 3);
    for (const [id, r] of tables) {
      assert.equal(r.DeletionPolicy, 'Retain', `${id} DeletionPolicy`);
      assert.equal(r.UpdateReplacePolicy, 'Retain', `${id} UpdateReplacePolicy`);
    }
  }
});

test('(e) the Stream filter matches the outbox key prefix and key attribute the code writes', () => {
  const r = render('stg');
  const filter = JSON.parse(r['OutboxTrigger']!.Properties.FilterCriteria.Filters[0].Pattern);
  const pk = outbox(0, '2026-01-01T00:00:00.000Z', 'x').PK;
  const prefix = pk.replace(/\d+$/, '');
  const hash = parseTemplate(readFileSync(TABLES, 'utf8')).Resources;
  const main = Object.values(hash).find((t) => t.Properties.TableName === 'sm-main')!.Properties['KeySchema'] as { AttributeName: string; KeyType: string }[];
  const hashName = main.find((k) => k.KeyType === 'HASH')!.AttributeName;
  assert.deepEqual(filter, { eventName: ['INSERT'], dynamodb: { Keys: { [hashName]: { S: [{ prefix }] } } } });
  const m = r['OutboxTrigger']!.Properties;
  assert.equal(m.BatchSize, 50); assert.equal(m.BisectBatchOnFunctionError, true); assert.deepEqual(m.FunctionResponseTypes, ['ReportBatchItemFailures']);
  assert.equal(m.EventSourceArn, '<Main.StreamArn>');
});

test('(f) the drain runs every minute and the hourly jobs run at :17, with the inputs the worker reads', () => {
  const r = render('sm');
  assert.equal(r['DrainEveryMinute']!.Properties.ScheduleExpression, 'rate(1 minute)');
  assert.equal(r['DrainEveryMinute']!.Properties.Target.Input, '{"kind":"drain"}');
  assert.equal(r['JobsHourly']!.Properties.ScheduleExpression, 'cron(17 * * * ? *)');
  assert.equal(r['JobsHourly']!.Properties.Target.Input, '{"kind":"jobs"}');
  assert.equal(r['JobsHourly']!.Properties.Name, 'sm-jobs-hourly');
  for (const id of ['DrainEveryMinute', 'JobsHourly']) {
    assert.equal(r[id]!.Properties.FlexibleTimeWindow.Mode, 'OFF');
    assert.equal(r[id]!.Properties.Target.Arn, '<Worker.Arn>');
    assert.equal(r[id]!.Properties.Target.RoleArn, '<SchedulerRoleArn>');
  }
});

test('(g) only the approved resource types: no IAM, S3, KMS, API Gateway, VPC, ECR', () => {
  const allowed = new Set([
    'AWS::DynamoDB::Table', 'AWS::Lambda::Function', 'AWS::Lambda::Url', 'AWS::Lambda::Permission', 'AWS::Lambda::EventSourceMapping',
    'AWS::Scheduler::Schedule', 'AWS::Logs::LogGroup',
  ]);
  for (const [id, r] of Object.entries(template.Resources as Record<string, { Type: string }>)) assert.ok(allowed.has(r.Type), `${id} is ${r.Type}`);
  assert.deepEqual(Object.keys(template.Parameters).sort(), ['ApiRoleArn', 'Env', 'SchedulerRoleArn']);
  assert.deepEqual(template.Parameters.Env.AllowedValues, ['stg', 'sm']);
  assert.deepEqual(Object.keys(template.Outputs), ['ApiUrl']);
});

test('functions: sizes, runtime, architecture, public URL', () => {
  const r = render('stg');
  assert.deepEqual([r['Api']!.Properties.MemorySize, r['Api']!.Properties.Timeout], [1024, 30]);
  assert.deepEqual([r['Worker']!.Properties.MemorySize, r['Worker']!.Properties.Timeout], [512, 300]);
  for (const id of ['Api', 'Worker']) {
    assert.equal(r[id]!.Properties.Runtime, 'nodejs22.x'); assert.deepEqual(r[id]!.Properties.Architectures, ['arm64']);
    assert.equal(r[id]!.Properties.Role, '<ApiRoleArn>');
    assert.match(r[id]!.Properties.Code.ZipFile, /503/);
  }
  assert.equal(r['ApiUrl']!.Properties.AuthType, 'NONE'); assert.equal(r['ApiUrl']!.Properties.InvokeMode, 'BUFFERED');
  assert.equal(r['ApiUrlPermission']!.Properties.Action, 'lambda:InvokeFunctionUrl');
});
