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
        // M28: the Has* conditions depend on parameters the test does not set; the node stays as written (G-M28-CONC reads it).
        if (cond === 'HasApiReserved' || cond === 'HasWorkerReserved') return node;
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
    // M28 US3: the prod-only resources (alarms, topic; `Condition: IsProd`) do not exist in staging and are checked by G-M28-ALARM; every other resource is checked here.
    const text = JSON.stringify(Object.fromEntries(Object.entries(render(env)).filter(([id]) => !(template.Resources[id] as Json).Condition)));
    const names = [...text.matchAll(/"(?:TableName|FunctionName|Name|LogGroupName)":"([^"]+)"/g)].map((m) => m[1]!).filter((n) => !n.startsWith('<'));
    assert.ok(names.length === 9, `found ${names.length} names`);
    for (const n of names) assert.ok(n.replace(/^\/aws\/lambda\//, '').startsWith(mine), `${env}: ${n} must start ${mine}`);
    assert.ok(!text.includes(other), `${env} must not mention ${other}`);
  }
});

test('(c) PITR on main and events in both environments; deletion protection on prod only; cache neither; log retention 14 / 3', () => {
  for (const env of ['stg', 'sm'] as const) {
    const r = render(env);
    for (const id of ['Main', 'Events'] as const) {
      const p = r[id]!.Properties;
      assert.equal(p.DeletionProtectionEnabled, env === 'sm', `${env} ${id} deletion protection`);
      assert.equal(p.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, true, `${env} ${id} PITR`); // M28 R10: staging too (was env === 'sm')
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
    // M28 US3: failure queues, the async-failure destination, the alarm topic and the alarms (no IAM, no S3, no KMS).
    'AWS::SQS::Queue', 'AWS::Lambda::EventInvokeConfig', 'AWS::SNS::Topic', 'AWS::SNS::Subscription', 'AWS::CloudWatch::Alarm',
  ]);
  for (const [id, r] of Object.entries(template.Resources as Record<string, { Type: string }>)) assert.ok(allowed.has(r.Type), `${id} is ${r.Type}`);
  // M28 T004: AlertEmail, ApiReserved, WorkerReserved are the only parameters added (specs/029 gate-log: an additive allow-list change, not a weaker assertion).
  assert.deepEqual(Object.keys(template.Parameters).sort(), ['AlertEmail', 'ApiReserved', 'ApiRoleArn', 'Env', 'SchedulerRoleArn', 'WorkerReserved']);
  assert.deepEqual(template.Parameters.Env.AllowedValues, ['stg', 'sm']);
  assert.deepEqual(Object.keys(template.Outputs), ['ApiUrl', 'AlertsTopicArn']);
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

test('G-M28-CONC: reserved concurrency only through the Has* conditions; the Stream mapping runs one batch per shard', () => {
  const props = template.Resources;
  // Written only when the parameter is > 0; otherwise the property is absent (AWS::NoValue), so a low account limit never blocks the deploy.
  assert.deepEqual(props.Api.Properties.ReservedConcurrentExecutions, { 'Fn::If': ['HasApiReserved', { Ref: 'ApiReserved' }, { Ref: 'AWS::NoValue' }] });
  assert.deepEqual(props.Worker.Properties.ReservedConcurrentExecutions, { 'Fn::If': ['HasWorkerReserved', { Ref: 'WorkerReserved' }, { Ref: 'AWS::NoValue' }] });
  assert.deepEqual(template.Conditions.HasApiReserved, { 'Fn::Not': [{ 'Fn::Equals': [{ Ref: 'ApiReserved' }, 0] }] });
  assert.deepEqual(template.Conditions.HasWorkerReserved, { 'Fn::Not': [{ 'Fn::Equals': [{ Ref: 'WorkerReserved' }, 0] }] });
  assert.equal(props.OutboxTrigger.Properties.ParallelizationFactor, 1);
  // ScalingConfig.MaximumConcurrency is SQS-only (research R3): a Stream mapping must not carry one.
  assert.equal('ScalingConfig' in props.OutboxTrigger.Properties, false);
});

const RES = template.Resources as Record<string, { Type: string; Condition?: string; Properties: Json }>;
const alarms = Object.entries(RES).filter(([, r]) => r.Type === 'AWS::CloudWatch::Alarm');

test('G-M28-ALARM: exactly the 10 alarms of research R4, each prod-only, to the one topic, missing data not breaching, with a runbook anchor', () => {
  assert.equal(alarms.length, 10, `alarms: ${alarms.map(([id]) => id).join(', ')}`);
  // Every alarm reads one metric today; a metric-math alarm would count each metric it reads (the 10-metric free tier).
  const metrics = alarms.reduce((n, [, r]) => n + (Array.isArray(r.Properties.Metrics) ? r.Properties.Metrics.filter((m: Json) => m.MetricStat).length : 1), 0);
  assert.ok(metrics <= 10, `${metrics} alarm metrics; the free tier holds 10`);
  for (const [id, r] of alarms) {
    assert.equal(r.Condition, 'IsProd', `${id}: Condition IsProd`);
    assert.deepEqual(r.Properties.AlarmActions, [{ Ref: 'Alerts' }], `${id}: AlarmActions`);
    assert.deepEqual(r.Properties.OKActions, [{ Ref: 'Alerts' }], `${id}: OKActions`);
    assert.equal(r.Properties.TreatMissingData, 'notBreaching', `${id}: TreatMissingData`);
    assert.match(String(r.Properties.AlarmDescription), /^docs\/runbooks\/alarms\.md#[a-z0-9-]+ /, `${id}: AlarmDescription`);
  }
  assert.equal(new Set(alarms.map(([, r]) => String(r.Properties.AlarmDescription).split(' ')[0])).size, 10, 'one anchor each');
  const topic = RES['Alerts']!;
  assert.equal(topic.Type, 'AWS::SNS::Topic');
  assert.equal(topic.Condition, 'IsProd');
  const sub = RES['AlertsEmail']!;
  assert.equal(sub.Type, 'AWS::SNS::Subscription');
  assert.equal(sub.Properties.Protocol, 'email');
  assert.deepEqual(sub.Properties.Endpoint, { Ref: 'AlertEmail' });
  assert.deepEqual(template.Conditions[sub.Condition!], { 'Fn::And': [{ Condition: 'IsProd' }, { Condition: 'HasAlertEmail' }] }, 'only in prod and only with an address');
  assert.equal(template.Outputs.AlertsTopicArn.Condition, 'IsProd');
  // None outside IsProd: staging has no alarm and no topic.
  for (const [id, r] of Object.entries(RES)) if (r.Type.startsWith('AWS::CloudWatch::') || r.Type === 'AWS::SNS::Topic') assert.equal(r.Condition, 'IsProd', `${id} must be prod only`);
});

test('G-M28-DLQ: both failure queues in both environments; the worker, both schedules and the Stream trigger point at them', () => {
  for (const id of ['WorkerDlq', 'OutboxFailed']) {
    assert.equal(RES[id]!.Type, 'AWS::SQS::Queue');
    assert.equal(RES[id]!.Condition, undefined, `${id} exists in staging too`);
    assert.equal(RES[id]!.Properties.MessageRetentionPeriod, 1209600);
    assert.equal(RES[id]!.Properties.SqsManagedSseEnabled, true);
  }
  assert.deepEqual(RES['WorkerDlq']!.Properties.QueueName, { 'Fn::Sub': '${Env}-worker-dlq' });
  assert.deepEqual(RES['OutboxFailed']!.Properties.QueueName, { 'Fn::Sub': '${Env}-outbox-failed' });
  const a = RES['WorkerAsync']!.Properties;
  assert.equal(RES['WorkerAsync']!.Type, 'AWS::Lambda::EventInvokeConfig');
  assert.deepEqual([a.FunctionName, a.Qualifier, a.MaximumRetryAttempts], [{ Ref: 'Worker' }, '$LATEST', 2]);
  assert.deepEqual(a.DestinationConfig, { OnFailure: { Destination: { 'Fn::GetAtt': ['WorkerDlq', 'Arn'] } } });
  for (const id of ['DrainEveryMinute', 'JobsHourly']) {
    assert.deepEqual(RES[id]!.Properties.Target.DeadLetterConfig, { Arn: { 'Fn::GetAtt': ['WorkerDlq', 'Arn'] } }, `${id} DeadLetterConfig`);
    assert.deepEqual(RES[id]!.Properties.Target.RetryPolicy, { MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 3600 }, `${id} RetryPolicy`);
  }
  const m = RES['OutboxTrigger']!.Properties;
  assert.deepEqual(m.DestinationConfig, { OnFailure: { Destination: { 'Fn::GetAtt': ['OutboxFailed', 'Arn'] } } });
  assert.equal(m.MaximumRecordAgeInSeconds, 3600);
  assert.equal(m.MaximumRetryAttempts, 3, 'the existing retry count is kept');
});
