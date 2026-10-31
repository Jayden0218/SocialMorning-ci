// M30 T011: GET /v1/health says which environment and build answered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './harness.ts';

const KEYS = ['APP_ENV', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_SHA', 'BUILD_COMMIT', 'BUILD_TIME'];
async function withEnv<T>(set: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(set)) if (v !== undefined) process.env[k] = v;
  try { return await fn(); } finally { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
async function health(): Promise<Record<string, unknown>> {
  const t = await freshDb();
  try { return (await (await t.call('GET', '/v1/health')).json()) as Record<string, unknown>; } finally { await t.close(); }
}

test('health: env, commit and builtAt appear beside ok and db', async () => {
  const j = await withEnv({ APP_ENV: 'qa', VERCEL_GIT_COMMIT_SHA: 'abc123', BUILD_COMMIT: 'zzz', BUILD_TIME: '2026-10-27T00:00:00Z' }, health);
  assert.equal(j['ok'], true); assert.equal(j['db'], 'ok');
  assert.equal(j['env'], 'qa'); assert.equal(j['commit'], 'abc123', 'the Vercel sha wins over BUILD_COMMIT');
  assert.equal(j['builtAt'], '2026-10-27T00:00:00Z');
});

test('health: defaults — unset APP_ENV is dev (prod on a Vercel production deploy), commit falls back to BUILD_COMMIT then unknown, builtAt null', async () => {
  const a = await withEnv({}, health);
  assert.equal(a['env'], 'dev'); assert.equal(a['commit'], 'unknown'); assert.equal(a['builtAt'], null);
  const b = await withEnv({ VERCEL_ENV: 'production', BUILD_COMMIT: 'stamp9' }, health);
  assert.equal(b['env'], 'prod'); assert.equal(b['commit'], 'stamp9');
  const c = await withEnv({ APP_ENV: 'staging', VERCEL_ENV: 'production' }, health);
  assert.equal(c['env'], 'staging');
});

// M30 T080: the build stamp esbuild bakes in (`--define`) is the fallback; env wins; neither → unknown / null.
async function withBaked<T>(baked: { c?: string; t?: string }, fn: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  try {
    if (baked.c !== undefined) g['__BUILD_COMMIT__'] = baked.c;
    if (baked.t !== undefined) g['__BUILD_TIME__'] = baked.t;
    return await fn();
  } finally { delete g['__BUILD_COMMIT__']; delete g['__BUILD_TIME__']; }
}

test('health: with no env the baked build constants answer', async () => {
  const j = await withEnv({}, () => withBaked({ c: 'baked123', t: '2026-10-27T01:02:03Z' }, health));
  assert.equal(j['commit'], 'baked123'); assert.equal(j['builtAt'], '2026-10-27T01:02:03Z');
});

test('health: env wins over the baked constants', async () => {
  const j = await withEnv({ VERCEL_GIT_COMMIT_SHA: 'vsha', BUILD_TIME: '2030-01-01T00:00:00Z' }, () => withBaked({ c: 'baked123', t: '2026-10-27T01:02:03Z' }, health));
  assert.equal(j['commit'], 'vsha'); assert.equal(j['builtAt'], '2030-01-01T00:00:00Z');
  const k = await withEnv({ BUILD_COMMIT: 'bc' }, () => withBaked({ c: 'baked123' }, health));
  assert.equal(k['commit'], 'bc');
});

test('health: neither env nor constants → unknown / null', async () => {
  const j = await withEnv({}, () => withBaked({}, health));
  assert.equal(j['commit'], 'unknown'); assert.equal(j['builtAt'], null);
});
