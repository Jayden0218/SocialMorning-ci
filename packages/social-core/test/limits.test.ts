// Tests the shared limits keep the values the server and Studio promise to users.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUEUE_MAX } from '@socialmorning/player-core';
import { BAN_REASON_MAX, HOST_PICKS_MAX, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_LAUNCH_IMAGE_BYTES, SYNCED_QUEUE_MAX } from '../src/limits.ts';

test('the limits users are told about', () => {
  assert.equal(BAN_REASON_MAX, 200);
  assert.equal(HOST_PICKS_MAX, 20);
  assert.equal(MAX_AUDIO_BYTES, 200 * 1024 * 1024);
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_LAUNCH_IMAGE_BYTES, 1024 * 1024);
});

test('the synced queue limit is the player-core queue limit, not a copy', () => {
  assert.equal(SYNCED_QUEUE_MAX, QUEUE_MAX);
  assert.equal(SYNCED_QUEUE_MAX, 300);
});
