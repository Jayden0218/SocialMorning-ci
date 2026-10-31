// M32 T047 (review C10): an in-memory bucket in front of the write limiter's DynamoDB counter.
/**
 * Guard G-M32-C10. Break: in src/auth/write-limit.ts make `needsDb` return true -> the DB write count goes to 20.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { writeLimitDbHits, WRITES_PER_SESSION_MINUTE } from '../src/auth/write-limit.ts';

test('G-M32-C10: 20 writes by one session touch the DB limit counter at most twice', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const before = writeLimitDbHits.count;
  for (let i = 0; i < 20; i++) assert.notEqual((await t.call('POST', '/v1/me/playlists', { title: `p${i}` }, a.token)).status, 429);
  assert.ok(writeLimitDbHits.count - before <= 2, `DB limit writes: ${writeLimitDbHits.count - before}`);
  await t.close();
});

test('G-M32-C10: the 301st write in a minute by a session is still refused (and the 300th is not)', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const statuses: number[] = [];
  const minute = Math.floor(Date.now() / 60_000);
  for (let i = 0; i < WRITES_PER_SESSION_MINUTE + 1; i++) statuses.push((await t.call('POST', '/v1/me/playlists', { title: 'x' }, a.token)).status);
  if (Math.floor(Date.now() / 60_000) !== minute) return; // the loop crossed a minute boundary: the window reset, nothing to assert
  assert.ok(statuses.slice(0, WRITES_PER_SESSION_MINUTE).every((s) => s !== 429), 'first 300 pass');
  assert.equal(statuses[WRITES_PER_SESSION_MINUTE], 429);
  await t.close();
});
