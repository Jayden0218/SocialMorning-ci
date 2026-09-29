import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noun, plural } from '../src/plural.ts';

test('one is singular, every other count is plural', () => {
  assert.equal(plural(1, 'episode'), '1 episode');
  assert.equal(plural(0, 'episode'), '0 episodes');
  assert.equal(plural(2, 'reply', 'replies'), '2 replies');
  assert.equal(noun(1, 'subscription'), 'subscription');
  assert.equal(noun(3, 'subscription'), 'subscriptions');
});
