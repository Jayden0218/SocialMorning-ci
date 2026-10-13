// Builds apps/api/infra/stack.json (the one CloudFormation template for staging and prod) from infra/tables.yaml.
/**
 * M27 (specs/028-m27-aws-infra, contracts/stack.md). `npm run infra:build -w apps/api` rewrites stack.json;
 * test/infra-stack.test.ts fails when the committed file differs from a fresh build, so stack.json is never edited by hand.
 *
 * - Parameter `Env` is `stg` or `sm`: it prefixes every physical name. The IAM roles are NOT created here (FR-012): the
 *   owner makes them (docs/runbooks/m26-aws-setup.md) and passes their ARNs as `ApiRoleArn` and `SchedulerRoleArn`.
 * - Tables: the definitions in tables.yaml (the same source the tests use), renamed `${Env}-main` …, Retain on delete and
 *   replace, and PITR + deletion protection only when Env = sm and only on main and events (cache never).
 * - Lambda code: an inline placeholder that answers 503; the deploy workflow uploads the real zips afterwards
 *   (research R5 — an S3 bucket or an ECR repository would be billable resources nobody approved).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTemplate } from '../src/db/ddb/schema.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
type Json = Record<string, any>;

const sub = (s: string) => ({ 'Fn::Sub': s });
const ref = (n: string) => ({ Ref: n });
const getAtt = (n: string, a: string) => ({ 'Fn::GetAtt': [n, a] });
const ifProd = (yes: unknown, no: unknown) => ({ 'Fn::If': ['IsProd', yes, no] });

const PLACEHOLDER = `exports.handler = async () => ({ statusCode: 503, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'not deployed yet' }) });`;

export const OUTBOX_FILTER = { eventName: ['INSERT'], dynamodb: { Keys: { PK: { S: [{ prefix: 'OUTBOX#' }] } } } };

function tables(): Json {
  const src = parseTemplate(readFileSync(`${HERE}tables.yaml`, 'utf8')).Resources;
  const byName: Record<string, { id: string; role: string }> = { 'sm-main': { id: 'Main', role: 'main' }, 'sm-events': { id: 'Events', role: 'events' }, 'sm-cache': { id: 'Cache', role: 'cache' } };
  const out: Json = {};
  let previous: string | undefined;
  for (const res of Object.values(src)) {
    const p = structuredClone(res.Properties) as Json;
    const { id, role } = byName[p['TableName'] as string]!;
    p['TableName'] = sub(`\${Env}-${role}`);
    delete p['DeletionProtectionEnabled'];
    delete p['PointInTimeRecoverySpecification'];
    if (role !== 'cache') {
      p['DeletionProtectionEnabled'] = ifProd(true, false);
      // M28 R10: PITR is on in BOTH environments (staging is where the restore drill runs); only deletion protection is prod-only.
      p['PointInTimeRecoverySpecification'] = { PointInTimeRecoveryEnabled: true };
    } else {
      p['DeletionProtectionEnabled'] = false;
      p['PointInTimeRecoverySpecification'] = { PointInTimeRecoveryEnabled: false };
    }
    out[id] = {
      Type: 'AWS::DynamoDB::Table',
      // Tables with GSIs are created one at a time (tables.yaml header).
      ...(previous ? { DependsOn: previous } : {}),
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: p,
    };
    previous = id;
  }
  return out;
}

/**
 * M28 US3 (research R4): the 10 alarm metrics, prod only. `threshold` is the alarm line; `stat` is a Statistic or a percentile.
 * Every alarm writes to the one topic, treats missing data as fine (an idle API has no 5xx datapoint) and names its runbook anchor
 * in docs/runbooks/alarms.md. Dimension names are checked in research R4 (Url* names are NOT VERIFIED there).
 */
type AlarmSpec = {
  id: string; anchor: string; text: string; ns: 'AWS/Lambda' | 'AWS/SQS' | 'AWS/DynamoDB'; metric: string; dim: [string, unknown];
  stat: string; period: number; evaluations: number; datapoints: number; op: 'GreaterThanOrEqualToThreshold' | 'GreaterThanThreshold'; threshold: number;
};
const ALARMS: AlarmSpec[] = [
  { id: 'AlarmApi5xx', anchor: 'api-5xx', text: 'The API answered 5 or more server errors in 5 minutes', ns: 'AWS/Lambda', metric: 'Url5xxCount', dim: ['FunctionName', ref('Api')], stat: 'Sum', period: 300, evaluations: 1, datapoints: 1, op: 'GreaterThanOrEqualToThreshold', threshold: 5 },
  { id: 'AlarmApiSlow', anchor: 'api-slow', text: 'The API p95 latency is over 500 ms for 15 minutes', ns: 'AWS/Lambda', metric: 'UrlRequestLatency', dim: ['FunctionName', ref('Api')], stat: 'p95', period: 300, evaluations: 3, datapoints: 3, op: 'GreaterThanThreshold', threshold: 500 },
  { id: 'AlarmApiThrottled', anchor: 'api-throttled', text: 'The API function was throttled', ns: 'AWS/Lambda', metric: 'Throttles', dim: ['FunctionName', ref('Api')], stat: 'Sum', period: 300, evaluations: 1, datapoints: 1, op: 'GreaterThanOrEqualToThreshold', threshold: 1 },
  { id: 'AlarmWorkerErrors', anchor: 'worker-errors', text: 'The worker function failed in two 15-minute periods in a row', ns: 'AWS/Lambda', metric: 'Errors', dim: ['FunctionName', ref('Worker')], stat: 'Sum', period: 900, evaluations: 2, datapoints: 2, op: 'GreaterThanOrEqualToThreshold', threshold: 1 },
  { id: 'AlarmWorkerThrottled', anchor: 'worker-throttled', text: 'The worker function was throttled', ns: 'AWS/Lambda', metric: 'Throttles', dim: ['FunctionName', ref('Worker')], stat: 'Sum', period: 900, evaluations: 1, datapoints: 1, op: 'GreaterThanOrEqualToThreshold', threshold: 1 },
  { id: 'AlarmStreamLag', anchor: 'stream-lag', text: 'The outbox stream is more than 5 minutes behind', ns: 'AWS/Lambda', metric: 'IteratorAge', dim: ['FunctionName', ref('Worker')], stat: 'Maximum', period: 300, evaluations: 2, datapoints: 2, op: 'GreaterThanThreshold', threshold: 300000 },
  { id: 'AlarmDlqVisible', anchor: 'failed-jobs', text: 'A scheduled or worker invocation failed and is waiting in the dead-letter queue', ns: 'AWS/SQS', metric: 'ApproximateNumberOfMessagesVisible', dim: ['QueueName', getAtt('WorkerDlq', 'QueueName')], stat: 'Maximum', period: 300, evaluations: 1, datapoints: 1, op: 'GreaterThanOrEqualToThreshold', threshold: 1 },
  { id: 'AlarmOutboxFailedVisible', anchor: 'failed-stream-batches', text: 'A stream batch was given up on and is waiting in the failed-batches queue', ns: 'AWS/SQS', metric: 'ApproximateNumberOfMessagesVisible', dim: ['QueueName', getAtt('OutboxFailed', 'QueueName')], stat: 'Maximum', period: 300, evaluations: 1, datapoints: 1, op: 'GreaterThanOrEqualToThreshold', threshold: 1 },
  { id: 'AlarmTableReadThrottle', anchor: 'table-reads-throttled', text: 'Reads on the main table were throttled', ns: 'AWS/DynamoDB', metric: 'ReadThrottleEvents', dim: ['TableName', ref('Main')], stat: 'Sum', period: 300, evaluations: 1, datapoints: 1, op: 'GreaterThanOrEqualToThreshold', threshold: 1 },
  { id: 'AlarmTableWriteThrottle', anchor: 'table-writes-throttled', text: 'Writes on the main table were throttled', ns: 'AWS/DynamoDB', metric: 'WriteThrottleEvents', dim: ['TableName', ref('Main')], stat: 'Sum', period: 300, evaluations: 1, datapoints: 1, op: 'GreaterThanOrEqualToThreshold', threshold: 1 },
];

function alarms(): Json {
  const out: Json = {};
  for (const a of ALARMS) {
    const pct = a.stat.startsWith('p');
    out[a.id] = {
      Type: 'AWS::CloudWatch::Alarm',
      Condition: 'IsProd',
      Properties: {
        AlarmName: sub(`\${Env}-${a.anchor}`),
        AlarmDescription: `docs/runbooks/alarms.md#${a.anchor} — ${a.text}`,
        Namespace: a.ns, MetricName: a.metric, Dimensions: [{ Name: a.dim[0], Value: a.dim[1] }],
        ...(pct ? { ExtendedStatistic: a.stat } : { Statistic: a.stat }),
        Period: a.period, EvaluationPeriods: a.evaluations, DatapointsToAlarm: a.datapoints,
        ComparisonOperator: a.op, Threshold: a.threshold, TreatMissingData: 'notBreaching',
        AlarmActions: [ref('Alerts')], OKActions: [ref('Alerts')],
      },
    };
  }
  return out;
}

export function buildStack(): Json {
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: 'SocialMorning API stack: DynamoDB tables, the API and worker Lambda functions, outbox trigger, schedules, log groups. One stack per environment (Env = stg | sm). Generated by apps/api/infra/build-stack.ts — do not edit by hand.',
    Parameters: {
      Env: { Type: 'String', AllowedValues: ['stg', 'sm'], Description: 'stg = staging, sm = production. Prefixes every resource name.' },
      ApiRoleArn: { Type: 'String', Description: 'The Lambda execution role the owner created (<Env>-api-lambda-role).' },
      SchedulerRoleArn: { Type: 'String', Description: 'The EventBridge Scheduler role the owner created (<Env>-scheduler-role).' },
      AlertEmail: { Type: 'String', Default: '', Description: 'M28: where the production alarm topic sends email. Empty = the topic has no subscriber.' },
      ApiReserved: { Type: 'Number', Default: 0, MinValue: 0, Description: 'M28: reserved concurrency for the API function. 0 = none (the account limit may not allow one).' },
      WorkerReserved: { Type: 'Number', Default: 0, MinValue: 0, Description: 'M28: reserved concurrency for the worker function. 0 = none.' },
    },
    Conditions: {
      IsProd: { 'Fn::Equals': [ref('Env'), 'sm'] },
      HasApiReserved: { 'Fn::Not': [{ 'Fn::Equals': [ref('ApiReserved'), 0] }] },
      HasWorkerReserved: { 'Fn::Not': [{ 'Fn::Equals': [ref('WorkerReserved'), 0] }] },
      HasAlertEmail: { 'Fn::Not': [{ 'Fn::Equals': [ref('AlertEmail'), ''] }] },
      // The email subscription exists only in prod and only when the owner gave an address.
      ProdAlertEmail: { 'Fn::And': [{ Condition: 'IsProd' }, { Condition: 'HasAlertEmail' }] },
    },
    Resources: {
      ...tables(),
      ApiLogs: { Type: 'AWS::Logs::LogGroup', DeletionPolicy: 'Delete', Properties: { LogGroupName: sub('/aws/lambda/${Env}-api'), RetentionInDays: ifProd(14, 3) } },
      WorkerLogs: { Type: 'AWS::Logs::LogGroup', DeletionPolicy: 'Delete', Properties: { LogGroupName: sub('/aws/lambda/${Env}-worker'), RetentionInDays: ifProd(14, 3) } },
      Api: {
        Type: 'AWS::Lambda::Function',
        DependsOn: 'ApiLogs',
        Properties: {
          FunctionName: sub('${Env}-api'),
          Runtime: 'nodejs22.x', Architectures: ['arm64'], MemorySize: 1024, Timeout: 30,
          Handler: 'index.handler', Role: ref('ApiRoleArn'),
          // M28 US2 (R3): a spike cannot take the account's concurrency. Only written when the parameter is > 0 (a new account's limit may be too low for any reservation).
          ReservedConcurrentExecutions: { 'Fn::If': ['HasApiReserved', ref('ApiReserved'), { Ref: 'AWS::NoValue' }] },
          // M28 US6 (R8): where the API reads its secrets (SSM Parameter Store; src/secrets.ts). The deploy workflow's own environment JSON replaces this whole block and carries the same SECRETS_PATH.
          Environment: { Variables: { SECRETS_PATH: sub('/${Env}/api/') } },
          Code: { ZipFile: PLACEHOLDER },
        },
      },
      ApiUrl: { Type: 'AWS::Lambda::Url', Properties: { TargetFunctionArn: getAtt('Api', 'Arn'), AuthType: 'NONE', InvokeMode: 'BUFFERED' } },
      ApiUrlPermission: {
        Type: 'AWS::Lambda::Permission',
        Properties: { Action: 'lambda:InvokeFunctionUrl', FunctionName: ref('Api'), Principal: '*', FunctionUrlAuthType: 'NONE' },
      },
      // AWS now documents InvokeFunction (with InvokedViaFunctionUrl) next to InvokeFunctionUrl for AuthType NONE (gate-log "Looked up").
      ApiUrlInvokePermission: {
        Type: 'AWS::Lambda::Permission',
        Properties: { Action: 'lambda:InvokeFunction', FunctionName: ref('Api'), Principal: '*', InvokedViaFunctionUrl: true },
      },
      Worker: {
        Type: 'AWS::Lambda::Function',
        DependsOn: 'WorkerLogs',
        Properties: {
          FunctionName: sub('${Env}-worker'),
          Runtime: 'nodejs22.x', Architectures: ['arm64'], MemorySize: 512, Timeout: 300,
          Handler: 'index.handler', Role: ref('ApiRoleArn'),
          // M28 US2 (R3): the hard cap on the outbox stream's concurrency (a Stream mapping has no ScalingConfig).
          ReservedConcurrentExecutions: { 'Fn::If': ['HasWorkerReserved', ref('WorkerReserved'), { Ref: 'AWS::NoValue' }] },
          // M28 US6 (R8): the worker also refuses to start without JOB_TOKEN (its hourly job calls the API with it).
          Environment: { Variables: { SECRETS_PATH: sub('/${Env}/api/'), SECRETS_REQUIRED: 'JOB_TOKEN' } },
          Code: { ZipFile: PLACEHOLDER },
        },
      },
      // M28 US3 (R5): where a failed scheduled call, async invocation or Stream batch goes instead of vanishing. Standard queues, 14 days, SSE-SQS.
      WorkerDlq: { Type: 'AWS::SQS::Queue', Properties: { QueueName: sub('${Env}-worker-dlq'), MessageRetentionPeriod: 1209600, SqsManagedSseEnabled: true } },
      OutboxFailed: { Type: 'AWS::SQS::Queue', Properties: { QueueName: sub('${Env}-outbox-failed'), MessageRetentionPeriod: 1209600, SqsManagedSseEnabled: true } },
      WorkerAsync: {
        Type: 'AWS::Lambda::EventInvokeConfig',
        Properties: { FunctionName: ref('Worker'), Qualifier: '$LATEST', MaximumRetryAttempts: 2, DestinationConfig: { OnFailure: { Destination: getAtt('WorkerDlq', 'Arn') } } },
      },
      OutboxTrigger: {
        Type: 'AWS::Lambda::EventSourceMapping',
        Properties: {
          FunctionName: ref('Worker'),
          EventSourceArn: getAtt('Main', 'StreamArn'),
          StartingPosition: 'LATEST',
          BatchSize: 50,
          // M28 US2 (R3): one concurrent batch per shard. MaximumConcurrency is SQS-only, so no ScalingConfig here.
          ParallelizationFactor: 1,
          MaximumBatchingWindowInSeconds: 1,
          MaximumRetryAttempts: 3,
          // M28 US3 (R5): a record older than an hour, or a batch that keeps failing, lands in OutboxFailed instead of blocking the shard.
          MaximumRecordAgeInSeconds: 3600,
          DestinationConfig: { OnFailure: { Destination: getAtt('OutboxFailed', 'Arn') } },
          BisectBatchOnFunctionError: true,
          FunctionResponseTypes: ['ReportBatchItemFailures'],
          FilterCriteria: { Filters: [{ Pattern: JSON.stringify(OUTBOX_FILTER) }] },
        },
      },
      DrainEveryMinute: {
        Type: 'AWS::Scheduler::Schedule',
        Properties: {
          Name: sub('${Env}-outbox-drain'), ScheduleExpression: 'rate(1 minute)', FlexibleTimeWindow: { Mode: 'OFF' },
          Target: { Arn: getAtt('Worker', 'Arn'), RoleArn: ref('SchedulerRoleArn'), Input: '{"kind":"drain"}', DeadLetterConfig: { Arn: getAtt('WorkerDlq', 'Arn') }, RetryPolicy: { MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 3600 } },
        },
      },
      JobsHourly: {
        Type: 'AWS::Scheduler::Schedule',
        Properties: {
          Name: sub('${Env}-jobs-hourly'), ScheduleExpression: 'cron(17 * * * ? *)', FlexibleTimeWindow: { Mode: 'OFF' },
          Target: { Arn: getAtt('Worker', 'Arn'), RoleArn: ref('SchedulerRoleArn'), Input: '{"kind":"jobs"}', DeadLetterConfig: { Arn: getAtt('WorkerDlq', 'Arn') }, RetryPolicy: { MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 3600 } },
        },
      },
      // M28 US3 (R4): production alarms and the one topic they write to (prod only; the email address is the AlertEmail parameter).
      Alerts: { Type: 'AWS::SNS::Topic', Condition: 'IsProd', Properties: { TopicName: 'sm-alerts' } },
      AlertsEmail: { Type: 'AWS::SNS::Subscription', Condition: 'ProdAlertEmail', Properties: { TopicArn: ref('Alerts'), Protocol: 'email', Endpoint: ref('AlertEmail') } },
      ...alarms(),
    },
    Outputs: {
      ApiUrl: { Description: 'The API address (Lambda Function URL).', Value: getAtt('ApiUrl', 'FunctionUrl') },
      AlertsTopicArn: { Condition: 'IsProd', Description: 'M28: the production alarm topic.', Value: ref('Alerts') },
    },
  };
}

export const stackText = (): string => `${JSON.stringify(buildStack(), null, 2)}\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(`${HERE}stack.json`, stackText());
  console.log('wrote apps/api/infra/stack.json');
}
