// M30 T015: one environment's sessions and tables never work in another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, TEST_PEPPER } from './harness.ts';
import { createApp } from '../src/app.ts';
import { readConfig } from '../src/config.ts';

const PEPPER_QA = 'qa-pepper-qa-pepper-qa-pepper-qa-0000';
const PEPPER_PROD = 'prod-pepper-prod-pepper-prod-pepper-00';
const lambda = { AWS_LAMBDA_FUNCTION_NAME: 'x' };

test('a session token minted under one environment\'s pepper is refused by an app built with another\'s', async () => {
  const t = await freshDb();
  try {
    // The shared table is deliberate: only the pepper differs, so only the pepper can be what refuses.
    const { createSession } = await import('../src/auth/session.ts');
    const { id } = await signUp(t, 'iso@example.com', 'Iso');
    const qaToken = await createSession(t.db, id, PEPPER_QA);
    const qaApp = createApp({ db: t.db, pepper: PEPPER_QA });
    const prodApp = createApp({ db: t.db, pepper: PEPPER_PROD });
    const get = (app: ReturnType<typeof createApp>, tok: string) => app.request('/v1/me', { headers: { authorization: `Bearer ${tok}` } });
    assert.equal((await get(qaApp, qaToken)).status, 200, 'the token works where it was minted');
    assert.equal((await get(prodApp, qaToken)).status, 401, 'and not under another environment\'s pepper');
    assert.notEqual(PEPPER_QA, TEST_PEPPER);
  } finally { await t.close(); }
});

test('qa and prod use different table prefixes, and a qa config cannot take an AWS environment\'s prefix', () => {
  const qa = readConfig({ APP_ENV: 'qa', ...lambda });
  const prod = readConfig({ APP_ENV: 'prod', ...lambda });
  assert.equal(qa.tablePrefix, 'qa'); assert.equal(prod.tablePrefix, 'sm');
  assert.notEqual(qa.tablePrefix, prod.tablePrefix);
  for (const p of ['sm', 'stg']) {
    assert.throws(() => readConfig({ APP_ENV: 'qa', DDB_TABLE_PREFIX: p, ...lambda }), (e: Error) => e.message.startsWith('DDB_TABLE_PREFIX:'), p);
  }
  assert.throws(() => readConfig({ APP_ENV: 'prod', DDB_TABLE_PREFIX: 'qa', ...lambda }), /DDB_TABLE_PREFIX/);
});
