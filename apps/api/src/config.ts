// What environment the API runs in, which DynamoDB tables it uses, and the Db + options built from it.
/**
 * M27 (specs/028-m27-aws-infra, contracts/config-env.md, data-model.md "Environment"). One place reads the
 * environment variables, so dev, staging and prod differ only in configuration — and `src/server.ts`,
 * `src/vercel-entry.ts` and `src/lambda-entry.ts` stop repeating a block of `process.env[...]` spreads.
 *
 * - `APP_ENV` is `dev | staging | prod`. When it is unset, a Vercel production deploy (`VERCEL_ENV=production`) counts
 *   as `prod` and anything else as `dev`: the Vercel API project keeps its behaviour until the owner sets `APP_ENV=prod`
 *   there (gate-log "Owner steps"). Nothing else reads `VERCEL_ENV`.
 * - On `ddb` the three tables are `<prefix>-main`, `<prefix>-events`, `<prefix>-cache`; the prefix is `stg` for staging
 *   and `sm` for prod and cannot be anything else there; dev may use any other prefix (`dev` by default).
 *
 */
import type { AppDeps } from './app.ts';
import { gmailMailer } from './mail/mailer.ts';
import type { Db } from './db/db.ts';

export type AppEnv = 'dev' | 'staging' | 'prod';
type Env = Record<string, string | undefined>;

export const DEFAULT_AWS_REGION = 'ap-southeast-1';
/** The table-name prefix each AWS environment owns. */
export const ENV_PREFIX: Readonly<Record<'staging' | 'prod', string>> = { staging: 'stg', prod: 'sm' };

export type Config = {
  appEnv: AppEnv;
  /** DynamoDB Local only; never set on staging or prod. */
  ddbEndpoint: string | undefined;
  tablePrefix: string;
  awsRegion: string;
  /** Running inside AWS Lambda (the runtime sets AWS_LAMBDA_FUNCTION_NAME). */
  inLambda: boolean;
  /** Google test purchases: on everywhere except prod, where only ALLOW_TEST_PURCHASES=1 turns them on (research D2). */
  allowTestPurchases: boolean;
};

const bad = (name: string, why: string): never => { throw new Error(`${name}: ${why}`); };

function localEndpoint(endpoint: string): boolean {
  let host: string;
  try { host = new URL(endpoint).hostname; } catch { return false; }
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === 'dynamodb' || host === 'dynamodb-local';
}

/**
 * Google test purchases: on everywhere except prod, where only ALLOW_TEST_PURCHASES=1 turns them on. Never throws (createApp calls it in every
 * test and server): an unknown APP_ENV counts as prod, the safe side; readConfig is what refuses it loudly.
 */
export function testPurchasesAllowed(env: Env = process.env): boolean {
  const appEnv = env['APP_ENV'] ?? (env['VERCEL_ENV'] === 'production' ? 'prod' : 'dev');
  return appEnv === 'dev' || appEnv === 'staging' || env['ALLOW_TEST_PURCHASES'] === '1';
}

export function readConfig(env: Env = process.env): Config {
  const rawEnv = env['APP_ENV'] ?? (env['VERCEL_ENV'] === 'production' ? 'prod' : 'dev');
  if (rawEnv !== 'dev' && rawEnv !== 'staging' && rawEnv !== 'prod') bad('APP_ENV', `"${rawEnv}" is not one of dev, staging, prod`);
  const appEnv = rawEnv as AppEnv;

  // There is no other data layer: a leftover DATA_BACKEND=pg must not be read as "use Postgres".
  if (env['DATA_BACKEND'] && env['DATA_BACKEND'] !== 'ddb') bad('DATA_BACKEND', `"${env['DATA_BACKEND']}": Postgres was removed; the API runs on DynamoDB only (unset it)`);

  const ddbEndpoint = env['DDB_ENDPOINT'] || undefined;
  const awsRegion = env['AWS_REGION'] || DEFAULT_AWS_REGION;
  const inLambda = Boolean(env['AWS_LAMBDA_FUNCTION_NAME']);

  if (appEnv === 'prod' && ddbEndpoint) bad('DDB_ENDPOINT', 'must not be set when APP_ENV=prod (it would point production at a local DynamoDB)');
  if (ddbEndpoint && !localEndpoint(ddbEndpoint)) bad('DDB_ENDPOINT', `"${ddbEndpoint}" is not a local endpoint; real AWS is reached with no endpoint, inside Lambda`);

  const owned = appEnv === 'dev' ? undefined : ENV_PREFIX[appEnv];
  const given = env['DDB_TABLE_PREFIX'] || undefined;
  if (given && !/^[a-z][a-z0-9_]{0,30}$/.test(given)) bad('DDB_TABLE_PREFIX', `"${given}" must be lowercase letters, digits or _ and start with a letter`);
  if (owned && given && given !== owned) bad('DDB_TABLE_PREFIX', `"${given}" does not match APP_ENV=${appEnv} (its tables start "${owned}-")`);
  if (!owned && given && Object.values(ENV_PREFIX).includes(given)) bad('DDB_TABLE_PREFIX', `"${given}" belongs to an AWS environment; APP_ENV=dev must not use it`);
  const tablePrefix = given ?? owned ?? 'dev';

  // 027's client.ts rule kept: without a local endpoint the DynamoDB client is refused unless we run inside Lambda.
  if (!ddbEndpoint && !inLambda) bad('DDB_ENDPOINT', 'outside AWS Lambda the API needs a local DDB_ENDPOINT outside AWS Lambda (no AWS account is approved for local runs)');

  return { appEnv, ddbEndpoint, tablePrefix, awsRegion, inLambda, allowTestPurchases: testPurchasesAllowed(env) };
}

/** The three table names of an environment: `<prefix>-main`, `-events`, `-cache`. */
export const tablesFor = (prefix: string) => ({ main: `${prefix}-main`, events: `${prefix}-events`, cache: `${prefix}-cache` });

/** The `Db` the app runs on, and (on DynamoDB) the clients, for scripts that need to create tables. */
export async function dbFromConfig(cfg: Config, env: Env = process.env): Promise<{ db: Db; ddb?: import('./db/ddb/client.ts').Clients; tables?: ReturnType<typeof tablesFor> }> {
  const [{ createDdbClients }, { createStore }, { withStore }] = await Promise.all([
    import('./db/ddb/client.ts'), import('./db/ddb/store.ts'), import('./db/backend-ddb.ts'),
  ]);
  const clients = createDdbClients({ region: cfg.awsRegion, ...(cfg.ddbEndpoint ? { endpoint: cfg.ddbEndpoint } : { allowAws: true }) });
  const tables = tablesFor(cfg.tablePrefix);
  // Cursors are signed; without CURSOR_SECRET the session pepper (already a server secret) signs them.
  const secret = env['CURSOR_SECRET'] || `cursor:${env['SESSION_PEPPER'] ?? ''}`;
  const store = createStore({ clients, tables, secret });
  return { db: withStore(undefined, store), ddb: clients, tables };
}

/** Everything `createApp` needs, from the environment. Throws, naming the variable, when something required is missing or inconsistent. */
export async function depsFromEnv(env: Env = process.env): Promise<AppDeps> {
  const pepper = env['SESSION_PEPPER'];
  if (!pepper) throw new Error('SESSION_PEPPER is not set (apps/api/.env — see .env.example)');
  const config = readConfig(env);
  const { db } = await dbFromConfig(config, env);
  return {
    db, pepper, allowTestPurchases: config.allowTestPurchases,
    ...(env['ASSETLINKS_SHA256'] ? { assetLinksSha256: env['ASSETLINKS_SHA256'] } : {}),
    ...(env['OWNER_LISTENER_ID'] ? { ownerListenerId: env['OWNER_LISTENER_ID'] } : {}),
    ...(env['APPEALS_EMAIL'] ? { appealsEmail: env['APPEALS_EMAIL'] } : {}),
    ...(env['RELEASE_SHA256'] ? { releaseSha256: env['RELEASE_SHA256'] } : {}),
    ...(env['JOB_TOKEN'] ? { jobToken: env['JOB_TOKEN'] } : {}),
    // M25 SB: the second pepper during a secret rotation (docs/runbooks/secret-rotation.md).
    ...(env['PEPPER_NEXT'] ? { pepperNext: env['PEPPER_NEXT'] } : {}),
    ...(env['GMAIL_USER'] && env['GMAIL_APP_PASSWORD'] ? { mailer: gmailMailer(env['GMAIL_USER'], env['GMAIL_APP_PASSWORD']) } : {}),
  };
}
