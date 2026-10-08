// Guards G-M22-1 and G-M22-4: who gets a push for a notice, and likes grouped in 10 minutes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPush, isLikeKind, LIKE_WINDOW_MS, type PushPrefs, type PushRelations } from '../src/push-rules.ts';

const ALL: PushPrefs = { replies: true, likes: true, follows: true, mentions: true, statuses: true };
const NONE: PushRelations = { blocked: false, muted: false, threadMuted: false };
const AT = 1_700_000_000_000;
const n = (kind: Parameters<typeof shouldPush>[0]['kind'], actorId = 'b') => ({ kind, actorId, recipientId: 'a', at: AT });

test('G-M22-1: a reply pushes; your own act never does', () => {
  assert.deepEqual(shouldPush(n('reply'), ALL, NONE, null), { send: true, grouped: false });
  assert.deepEqual(shouldPush(n('reply', 'a'), ALL, NONE, null), { send: false });
});

test('G-M22-1: blocked, muted person or muted thread → no push', () => {
  assert.deepEqual(shouldPush(n('reply'), ALL, { ...NONE, blocked: true }, null), { send: false });
  assert.deepEqual(shouldPush(n('mention'), ALL, { ...NONE, muted: true }, null), { send: false });
  assert.deepEqual(shouldPush(n('like_post_comment'), ALL, { ...NONE, threadMuted: true }, null), { send: false });
});

test('each kind follows its own switch', () => {
  assert.deepEqual(shouldPush(n('follow'), { ...ALL, follows: false }, NONE, null), { send: false });
  assert.deepEqual(shouldPush(n('like'), { ...ALL, likes: false }, NONE, null), { send: false });
  assert.deepEqual(shouldPush(n('status_reply'), { ...ALL, statuses: false }, NONE, null), { send: false });
  assert.deepEqual(shouldPush(n('like_post_comment'), { ...ALL, replies: false }, NONE, null), { send: false });
  assert.deepEqual(shouldPush(n('status_milestone'), ALL, NONE, null), { send: true, grouped: false });
});

test('stop like notices on one comment', () => {
  assert.deepEqual(shouldPush(n('like'), ALL, { ...NONE, likeNoticesOff: true }, null), { send: false });
  // A like-post like is not a comment like; the switch does not apply.
  assert.deepEqual(shouldPush(n('like_post_like'), ALL, { ...NONE, likeNoticesOff: true }, null), { send: true, grouped: false });
});

test('G-M22-4: likes inside 10 minutes are grouped; after, a fresh push', () => {
  assert.deepEqual(shouldPush(n('like'), ALL, NONE, { firstAt: AT - 60_000, count: 19 }), { send: true, grouped: true, count: 20 });
  assert.deepEqual(shouldPush(n('like'), ALL, NONE, { firstAt: AT - LIKE_WINDOW_MS, count: 5 }), { send: true, grouped: false });
  // A window never groups a reply.
  assert.deepEqual(shouldPush(n('reply'), ALL, NONE, { firstAt: AT, count: 3 }), { send: true, grouped: false });
});

test('isLikeKind', () => {
  assert.equal(isLikeKind('status_reaction'), true);
  assert.equal(isLikeKind('follow'), false);
});
