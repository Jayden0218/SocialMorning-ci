// M28 US6 (G-M28-SECRET, G-M28-PEPPER): secrets from Parameter Store on Lambda, nowhere else; 15-minute refresh; a missing pepper refuses to start.
/**
 * An SSM client stub stands in for AWS (nothing here calls AWS). DynamoDB Local (DDB_ENDPOINT, default localhost:8000) is used only by the
 * PEPPER test, which signs a session in through the real app. The values below are made-up strings, not real secrets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSecrets, SECRETS_TTL_MS, SECRETS_RETRY_MS, SECRETS_LOG_EVERY_MS, type SsmLike } from '../src/secrets.ts';
import { depsFromEnv, dbFromConfig, readConfig } from '../src/config.ts';
import { createApp } from '../src/app.ts';
import { createListener } from '../src/db/repos/account/listeners.ts';
import { createSession } from '../src/auth/session.ts';
import { hashPassword } from '../src/auth/password.ts';

const PATH = '/stg/api/';
const ENDPOINT = process.env['DDB_ENDPOINT'] ?? 'http://localhost:8000';
const tick = () => new Promise<void>((r) => setImmediate(r));

/** A stub for the SSM client: `values` is the parameter store, `fail` makes every call throw, `pageSize` forces pagination. */
function stub(values: Record<string, string>, pageSize = 10) {
  const state = { values, fail: false, calls: [] as { Path?: string; WithDecryption?: boolean; Recursive?: boolean; MaxResults?: number; NextToken?: string }[] };
  const client: SsmLike = {
    send: async (command) => {
      const input = command.input;
      state.calls.push({ ...input } as never);
      if (state.fail) throw Object.assign(new Error('boom'), { name: 'ThrottlingException' });
      const all = Object.entries(state.values).map(([k, v]) => ({ Name: `${input.Path}${k}`, Value: v }));
      const from = Number(input.NextToken ?? 0);
      const page = all.slice(from, from + pageSize);
      return { Parameters: page, ...(from + pageSize < all.length ? { NextToken: String(from + pageSize) } : {}) };
    },
  };
  return { client, state };
}

const LAMBDA = { AWS_LAMBDA_FUNCTION_NAME: 'stg-api', APP_ENV: 'dev', DDB_ENDPOINT: ENDPOINT, AWS_REGION: 'ap-southeast-1' };
const BASE = { SESSION_PEPPER: 'pepper-one-made-up', JOB_TOKEN: 'job-one-made-up' };

test('G-M28-SECRET: the loader asks for the path with decryption, not recursively, and follows every page', async () => {
  const many = Object.fromEntries(Array.from({ length: 23 }, (_, i) => [`S${i}`, `v${i}`]));
  const { client, state } = stub({ ...BASE, ...many }, 10);
  const logs: string[] = [];
  const s = await loadSecrets({ path: '/stg/api', client, required: ['SESSION_PEPPER'], log: (m) => logs.push(m) });
  assert.equal(s.get('S22'), 'v22', 'the last page was read');
  assert.equal(s.get('SESSION_PEPPER'), BASE.SESSION_PEPPER, 'the name is the last path segment');
  assert.equal(state.calls.length, 3, '25 parameters at 10 a page is 3 calls');
  for (const c of state.calls) {
    assert.equal(c.Path, PATH); assert.equal(c.WithDecryption, true); assert.equal(c.Recursive, false); assert.ok(c.MaxResults! <= 10);
  }
  assert.deepEqual(logs, ['secrets: 25 loaded from /stg/api/'], 'names and a count only');
  assert.ok(!logs.join('\n').includes(BASE.SESSION_PEPPER));
});

test('G-M28-SECRET: on Lambda with SECRETS_PATH the values come from the stub, not from the environment', async () => {
  const { client, state } = stub({ ...BASE, GMAIL_APP_PASSWORD: 'mail-made-up' });
  const env: Record<string, string> = { ...LAMBDA, SECRETS_PATH: PATH, DDB_TABLE_PREFIX: 'm28seca', SESSION_PEPPER: 'ENV-ignored', GMAIL_USER: 'a@example.com' };
  const deps = await depsFromEnv(env, { ssm: client, log: () => undefined });
  assert.equal(deps.pepper, BASE.SESSION_PEPPER);
  assert.equal(deps.jobToken, BASE.JOB_TOKEN);
  assert.ok(deps.mailer, 'GMAIL_USER from the environment plus the password from the store');
  assert.equal(env['JOB_TOKEN'], BASE.JOB_TOKEN, 'process.env readers (Groq, Blob, EDGE_SECRET) see the loaded values');
  assert.equal(state.calls.length, 1);
});

test('G-M28-SECRET: everywhere else the environment is read and SSM is never asked (Vercel, Node, Lambda without SECRETS_PATH)', async () => {
  const { client, state } = stub({ SESSION_PEPPER: 'from-ssm', JOB_TOKEN: 'from-ssm' });
  const mine = { SESSION_PEPPER: 'from-env', JOB_TOKEN: 'job-env', PEPPER_NEXT: 'next-env', DDB_ENDPOINT: ENDPOINT, DDB_TABLE_PREFIX: 'm28secb', APP_ENV: 'dev' };
  for (const extra of [{ SECRETS_PATH: PATH }, { ...LAMBDA, SECRETS_PATH: '' }, { AWS_LAMBDA_FUNCTION_NAME: 'x' }]) {
    const deps = await depsFromEnv({ ...mine, ...extra }, { ssm: client });
    assert.equal(deps.pepper, 'from-env'); assert.equal(deps.jobToken, 'job-env'); assert.equal(deps.pepperNext, 'next-env');
    assert.equal(Object.getOwnPropertyDescriptor(deps, 'pepper')!.get, undefined, 'plain values, as before');
  }
  assert.equal(state.calls.length, 0, 'no SSM call outside Lambda + SECRETS_PATH');
});

test('G-M28-SECRET: SESSION_PEPPER missing → the start is refused, naming the secret and the path', async () => {
  const { client } = stub({ JOB_TOKEN: 'x' });
  await assert.rejects(depsFromEnv({ ...LAMBDA, SECRETS_PATH: PATH, DDB_TABLE_PREFIX: 'm28secc' }, { ssm: client, log: () => undefined }), /secret SESSION_PEPPER is not set at \/stg\/api\//);
  // The worker also needs the job token (SECRETS_REQUIRED, set on that function by the stack).
  const { client: c2 } = stub({ SESSION_PEPPER: 'p' });
  await assert.rejects(depsFromEnv({ ...LAMBDA, SECRETS_PATH: PATH, SECRETS_REQUIRED: 'JOB_TOKEN', DDB_TABLE_PREFIX: 'm28secc' }, { ssm: c2, log: () => undefined }), /secret JOB_TOKEN is not set at \/stg\/api\//);
  // A failed first read is a refusal too: never a start with empty secrets.
  const { client: c3, state } = stub({ ...BASE }); state.fail = true;
  await assert.rejects(depsFromEnv({ ...LAMBDA, SECRETS_PATH: PATH, DDB_TABLE_PREFIX: 'm28secc' }, { ssm: c3, log: () => undefined }), /boom/);
});

test('G-M28-SECRET: after 15 minutes a changed JOB_TOKEN is used without a restart; the request that triggers the read does not wait for it', async () => {
  const { client, state } = stub({ ...BASE });
  let clock = 1_000_000;
  const env: Record<string, string> = { ...LAMBDA, SECRETS_PATH: PATH, DDB_TABLE_PREFIX: 'm28secd' };
  const deps = await depsFromEnv(env, { ssm: client, now: () => clock, log: () => undefined });
  assert.equal(deps.jobToken, 'job-one-made-up');
  state.values['JOB_TOKEN'] = 'job-two-made-up';
  clock += SECRETS_TTL_MS - 1;
  assert.equal(deps.jobToken, 'job-one-made-up', 'inside the 15 minutes the cache is used'); await tick();
  assert.equal(state.calls.length, 1, 'and SSM is not asked');
  clock += 1;
  assert.equal(deps.jobToken, 'job-one-made-up', 'the request that finds the cache old still gets the cached value'); await tick();
  assert.equal(state.calls.length, 2, 'one background re-read started');
  assert.equal(deps.jobToken, 'job-two-made-up', 'the next read has the new token'); await tick();
  assert.equal(env['JOB_TOKEN'], 'job-two-made-up', 'and so does process.env');
  assert.equal(state.calls.length, 2, 'the clock was reset: no third call');
});

test('G-M28-SECRET: only one re-read runs at a time; a deleted parameter disappears from the environment copy', async () => {
  const { client, state } = stub({ ...BASE, PEPPER_NEXT: 'next-made-up' });
  let clock = 5_000;
  const env: Record<string, string | undefined> = {};
  const s = await loadSecrets({ path: PATH, client, env, now: () => clock, log: () => undefined });
  assert.equal(env['PEPPER_NEXT'], 'next-made-up');
  delete state.values['PEPPER_NEXT'];
  clock += SECRETS_TTL_MS;
  s.get('JOB_TOKEN'); s.get('JOB_TOKEN'); s.get('SESSION_PEPPER'); await tick();
  assert.equal(state.calls.length, 2, 'three reads past the TTL started one re-read');
  assert.equal(s.get('PEPPER_NEXT'), undefined);
  assert.equal(env['PEPPER_NEXT'], undefined, 'removed again, not left behind');
});

test('G-M28-SECRET: a failed refresh keeps the old values, retries after 1 minute, and logs at most once an hour', async () => {
  const { client, state } = stub({ ...BASE });
  let clock = 10_000;
  const logs: string[] = [];
  const s = await loadSecrets({ path: PATH, client, required: ['SESSION_PEPPER'], now: () => clock, log: (m) => logs.push(m) });
  state.fail = true;
  clock += SECRETS_TTL_MS;
  assert.equal(s.get('JOB_TOKEN'), BASE.JOB_TOKEN); await tick();
  assert.equal(state.calls.length, 2);
  assert.equal(s.get('JOB_TOKEN'), BASE.JOB_TOKEN, 'the old value still serves'); await tick();
  assert.equal(state.calls.length, 2, 'no retry inside the minute');
  clock += SECRETS_RETRY_MS; s.get('JOB_TOKEN'); await tick();
  assert.equal(state.calls.length, 3, 'retried after a minute');
  assert.deepEqual(logs.filter((l) => l.includes('refresh failed')), ['secrets: refresh failed ThrottlingException'], 'logged once, by code, with no value');
  clock += SECRETS_LOG_EVERY_MS; s.get('JOB_TOKEN'); await tick();
  assert.equal(logs.filter((l) => l.includes('refresh failed')).length, 2, 'and again after an hour');
  // A re-read that lost a required name is a failed read, not new truth.
  state.fail = false; delete state.values['SESSION_PEPPER'];
  clock += SECRETS_RETRY_MS; s.get('JOB_TOKEN'); await tick();
  assert.equal(s.get('SESSION_PEPPER'), BASE.SESSION_PEPPER);
  // And recovery is picked up.
  state.values['SESSION_PEPPER'] = 'pepper-two-made-up'; state.values['JOB_TOKEN'] = 'job-three-made-up';
  clock += SECRETS_RETRY_MS; s.get('JOB_TOKEN'); await tick();
  assert.equal(s.get('JOB_TOKEN'), 'job-three-made-up');
});

test('G-M28-SECRET: the cursor secret is read through the store at each use', async () => {
  const { client, state } = stub({ ...BASE, CURSOR_SECRET: 'cursor-one' });
  let clock = 1;
  const env = { ...LAMBDA, SECRETS_PATH: PATH, DDB_TABLE_PREFIX: 'm28sece' };
  const s = await loadSecrets({ path: PATH, client, now: () => clock, log: () => undefined });
  const { db } = await dbFromConfig(readConfig(env), env, s);
  const { ATTACHED } = await import('../src/db/backend.ts');
  const store = ATTACHED.get(db)!.store;
  assert.equal(store.secret, 'cursor-one');
  state.values['CURSOR_SECRET'] = 'cursor-two'; clock += SECRETS_TTL_MS;
  void store.secret; await tick();
  assert.equal(store.secret, 'cursor-two');
  delete state.values['CURSOR_SECRET']; clock += SECRETS_TTL_MS;
  void store.secret; await tick();
  assert.equal(store.secret, `cursor:${BASE.SESSION_PEPPER}`, 'unset → the pepper signs them, as on the environment path');
});

test('G-M28-PEPPER: with PEPPER_NEXT in the store, a session hashed with the old pepper still signs in, and the swap works with no restart', async () => {
  const OLD = 'pepper-old-made-up', NEW = 'pepper-new-made-up';
  const { client, state } = stub({ SESSION_PEPPER: NEW, JOB_TOKEN: 'j', PEPPER_NEXT: OLD });
  let clock = 1;
  const prefix = `m28sec${process.pid}x${Math.random().toString(36).slice(2, 7)}`;
  const env: Record<string, string> = { ...LAMBDA, SECRETS_PATH: PATH, DDB_TABLE_PREFIX: prefix };
  const cfg = readConfig(env);
  const { ddb, tables } = await dbFromConfig(cfg, env);
  const { createTableSet, deleteTableSet } = await import('../src/db/ddb/schema.ts');
  await createTableSet(ddb!.raw, tables!);
  try {
    const deps = await depsFromEnv(env, { ssm: client, now: () => clock, log: () => undefined });
    const listener = await createListener(deps.db, 'pepper@example.com', await hashPassword('correct horse'), 'Pep');
    assert.notEqual(listener, 'exists');
    const token = await createSession(deps.db, (listener as { id: string }).id, OLD); // made before the rotation began
    const me = () => createApp(deps).request('/v1/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal((await me()).status, 200, 'the old-pepper session signs in because PEPPER_NEXT came from the store');
    // 90 days later the owner deletes PEPPER_NEXT; the session was re-keyed on use, so it still signs in with the new pepper alone.
    delete state.values['PEPPER_NEXT']; clock += SECRETS_TTL_MS; void deps.pepper; await tick();
    assert.equal(deps.pepperNext, undefined, 'the second pepper is gone after the refresh');
    assert.equal((await me()).status, 200, 're-keyed on first use');
  } finally {
    await deleteTableSet(ddb!.raw, tables!); ddb!.raw.destroy();
  }
});
