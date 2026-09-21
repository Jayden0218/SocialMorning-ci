import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';

test('round-trips, rejects a wrong password, never stores the password', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.match(stored, /^scrypt\$32768\$8\$3\$/);
  assert.equal(stored.includes('correct horse battery'), false);
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse batterx', stored), false);
  assert.equal(await verifyPassword('anything', 'garbage'), false);
});
