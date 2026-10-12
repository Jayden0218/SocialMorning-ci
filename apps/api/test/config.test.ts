// M27 T007: src/config.ts — defaults, the refusals (each names its variable), and a DynamoDB Store that works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig, testPurchasesAllowed, depsFromEnv, tablesFor, dbFromConfig } from '../src/config.ts';

const refuses = (env: Record<string, string>, variable: string) =>
  assert.throws(() => readConfig(env), (e: Error) => e.message.startsWith(`${variable}:`), `expected a refusal naming ${variable}`);

test('defaults: dev, Postgres, test purchases allowed', () => {
  const c = readConfig({});
  assert.equal(c.appEnv, 'dev'); assert.equal(c.dataBackend, 'pg'); assert.equal(c.awsRegion, 'ap-southeast-1');
  assert.equal(c.tablePrefix, 'dev'); assert.equal(c.inLambda, false); assert.equal(c.allowTestPurchases, true);
});

test('a Vercel production deploy with APP_ENV unset counts as prod; APP_ENV wins when set', () => {
  assert.equal(readConfig({ VERCEL_ENV: 'production' }).appEnv, 'prod');
  assert.equal(readConfig({ VERCEL_ENV: 'preview' }).appEnv, 'dev');
  assert.equal(readConfig({ VERCEL_ENV: 'production', APP_ENV: 'staging' }).appEnv, 'staging');
});

test('APP_ENV and DATA_BACKEND must be known values', () => {
  refuses({ APP_ENV: 'production' }, 'APP_ENV');
  refuses({ DATA_BACKEND: 'mysql' }, 'DATA_BACKEND');
});

test('test purchases: refused in prod unless ALLOW_TEST_PURCHASES=1', () => {
  assert.equal(readConfig({ APP_ENV: 'prod' }).allowTestPurchases, false);
  assert.equal(readConfig({ APP_ENV: 'prod', ALLOW_TEST_PURCHASES: '1' }).allowTestPurchases, true);
  assert.equal(readConfig({ APP_ENV: 'prod', ALLOW_TEST_PURCHASES: 'true' }).allowTestPurchases, false);
  assert.equal(readConfig({ APP_ENV: 'staging' }).allowTestPurchases, true);
});

test('an unknown APP_ENV is refused by readConfig but counts as prod for test purchases (safe side)', () => {
  refuses({ APP_ENV: 'production' }, 'APP_ENV');
  assert.equal(testPurchasesAllowed({ APP_ENV: 'production' }), false);
  assert.equal(testPurchasesAllowed({ APP_ENV: 'production', ALLOW_TEST_PURCHASES: '1' }), true);
});

test('APP_ENV=prod with DDB_ENDPOINT set is refused', () => {
  refuses({ APP_ENV: 'prod', DATA_BACKEND: 'ddb', DDB_ENDPOINT: 'http://localhost:8000' }, 'DDB_ENDPOINT');
});

test('a non-local DDB_ENDPOINT is refused, even inside Lambda', () => {
  refuses({ APP_ENV: 'staging', DATA_BACKEND: 'ddb', DDB_ENDPOINT: 'https://dynamodb.ap-southeast-1.amazonaws.com', AWS_LAMBDA_FUNCTION_NAME: 'stg-api' }, 'DDB_ENDPOINT');
});

test('the table prefix must match the environment', () => {
  refuses({ APP_ENV: 'staging', DATA_BACKEND: 'ddb', DDB_TABLE_PREFIX: 'sm', AWS_LAMBDA_FUNCTION_NAME: 'x' }, 'DDB_TABLE_PREFIX');
  refuses({ APP_ENV: 'prod', DATA_BACKEND: 'ddb', DDB_TABLE_PREFIX: 'stg', AWS_LAMBDA_FUNCTION_NAME: 'x' }, 'DDB_TABLE_PREFIX');
  refuses({ APP_ENV: 'dev', DATA_BACKEND: 'ddb', DDB_TABLE_PREFIX: 'sm', DDB_ENDPOINT: 'http://localhost:8000' }, 'DDB_TABLE_PREFIX');
  refuses({ DDB_TABLE_PREFIX: 'Bad-Prefix' }, 'DDB_TABLE_PREFIX');
  assert.equal(readConfig({ APP_ENV: 'staging', DATA_BACKEND: 'ddb', AWS_LAMBDA_FUNCTION_NAME: 'x' }).tablePrefix, 'stg');
  assert.equal(readConfig({ APP_ENV: 'prod', DATA_BACKEND: 'ddb', AWS_LAMBDA_FUNCTION_NAME: 'x' }).tablePrefix, 'sm');
  assert.deepEqual(tablesFor('stg'), { main: 'stg-main', events: 'stg-events', cache: 'stg-cache' });
});

test('DATA_BACKEND=ddb with no endpoint is refused outside Lambda, allowed inside', () => {
  refuses({ APP_ENV: 'staging', DATA_BACKEND: 'ddb' }, 'DDB_ENDPOINT');
  assert.equal(readConfig({ APP_ENV: 'staging', DATA_BACKEND: 'ddb', AWS_LAMBDA_FUNCTION_NAME: 'stg-api' }).inLambda, true);
});

test('depsFromEnv needs SESSION_PEPPER', async () => {
  await assert.rejects(depsFromEnv({}), /SESSION_PEPPER/);
});

test('depsFromEnv with DATA_BACKEND=ddb and a local endpoint gives a working Store, and no Postgres', async (t) => {
  const endpoint = process.env['DDB_ENDPOINT'];
  if (!endpoint) return t.skip('needs DynamoDB Local (DDB_ENDPOINT)');
  const prefix = `cfg${process.pid}x${Math.random().toString(36).slice(2, 7)}`;
  const env = { SESSION_PEPPER: 'p'.repeat(32), APP_ENV: 'dev', DATA_BACKEND: 'ddb', DDB_ENDPOINT: endpoint, DDB_TABLE_PREFIX: prefix, AWS_REGION: 'ap-southeast-1' };
  const cfg = readConfig(env);
  const { ddb, tables } = await dbFromConfig(cfg, env);
  const [{ createTableSet, deleteTableSet }, { ATTACHED }] = await Promise.all([import('../src/db/ddb/schema.ts'), import('../src/db/backend.ts')]);
  await createTableSet(ddb!.raw, tables!);
  try {
    const deps = await depsFromEnv(env);
    assert.equal(deps.allowTestPurchases, true);
    const attached = ATTACHED.get(deps.db);
    assert.ok(attached, 'the Db carries a Store');
    assert.equal(attached!.store.tables.main, `${prefix}-main`);
    const { put, get } = await import('../src/db/ddb/store.ts');
    await put(attached!.store, 'main', { PK: 'CFG#1', SK: 'A', v: 7 });
    assert.equal((await get(attached!.store, 'main', { PK: 'CFG#1', SK: 'A' }))?.['v'], 7);
    await assert.rejects(deps.db.query('select 1'), /called Postgres/);
  } finally {
    await deleteTableSet(ddb!.raw, tables!); ddb!.raw.destroy();
  }
});
