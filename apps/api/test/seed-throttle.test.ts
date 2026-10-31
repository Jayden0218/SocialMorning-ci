// M30 T019: the demo seed retries throttled DynamoDB writes (1-WCU indexes on the free environment) and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withThrottleRetry, isThrottle } from '../scripts/retry-throttle.ts';

const err = (name: string) => Object.assign(new Error(name), { name });
const noSleep = { sleep: async () => {} };

test('throttling errors are retried until the call succeeds', async () => {
  for (const name of ['ProvisionedThroughputExceededException', 'ThrottlingException', 'RequestLimitExceeded']) {
    let calls = 0;
    const r = await withThrottleRetry(async () => { calls++; if (calls <= 3) throw err(name); return 'done'; }, noSleep);
    assert.equal(r, 'done'); assert.equal(calls, 4, name);
  }
});

test('backoff grows exponentially with jitter, and gives up after 8 tries with the last error', async () => {
  const waits: number[] = [];
  let calls = 0;
  await assert.rejects(
    withThrottleRetry(async () => { calls++; throw err('ThrottlingException'); }, { sleep: async (ms) => { waits.push(ms); }, random: () => 0.5 }),
    (e: Error) => e.name === 'ThrottlingException');
  assert.equal(calls, 8); assert.equal(waits.length, 7);
  assert.ok(waits.every((w, i) => i === 0 || w > waits[i - 1]!), `waits grow: ${waits.join(',')}`);
  assert.ok(waits[0]! >= 100 && waits[0]! <= 200, `first wait near the 100 ms base: ${waits[0]}`);
});

test('a non-throttling error is thrown at once, not retried', async () => {
  let calls = 0;
  await assert.rejects(withThrottleRetry(async () => { calls++; throw err('ValidationException'); }, noSleep), /ValidationException/);
  assert.equal(calls, 1);
  assert.equal(isThrottle(err('ConditionalCheckFailedException')), false);
  assert.equal(isThrottle(null), false);
});

test('seedTables: dev and qa are the environments\' hyphenated tables, anything else is a scratch set', async () => {
  const { seedTables } = await import('../scripts/seed-demo.ts');
  assert.equal(seedTables('qa').main, 'qa-main');
  assert.equal(seedTables('dev').main, 'dev-main');
  assert.notEqual(seedTables('scratch1').main, 'scratch1-main');
});
