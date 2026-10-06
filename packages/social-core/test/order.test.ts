// Tests sorting comments by newest, by episode time, and by likes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDir, orderComments, smartScore } from '../src/order.ts';

const rows = [
  { id: 'a', offsetMs: 900_000, createdAt: 3 },
  { id: 'b', offsetMs: null, createdAt: 5 },
  { id: 'c', offsetMs: 10_000, createdAt: 1 },
  { id: 'd', offsetMs: 900_000, createdAt: 2 },
  { id: 'e', offsetMs: null, createdAt: 4 },
];

test('newest: createdAt descending', () => {
  assert.deepEqual(orderComments(rows, 'newest').map((r) => r.id), ['b', 'e', 'a', 'd', 'c']);
});

test('byMoment: timestamped in episode order (ties by createdAt asc), then moment-less newest first', () => {
  assert.deepEqual(orderComments(rows, 'byMoment').map((r) => r.id), ['c', 'd', 'a', 'b', 'e']);
});

test('does not mutate its input and is stable for equal keys', () => {
  const copy = rows.map((r) => ({ ...r }));
  orderComments(rows, 'byMoment');
  assert.deepEqual(rows, copy);
  const equal = [{ id: 'x', offsetMs: 1, createdAt: 1 }, { id: 'y', offsetMs: 1, createdAt: 1 }];
  assert.deepEqual(orderComments(equal, 'byMoment').map((r) => r.id), ['x', 'y']);
  assert.deepEqual(orderComments(equal, 'newest').map((r) => r.id), ['x', 'y']);
});

test('byMoment: two moment-less comments with the same createdAt keep input order', () => {
  const equal = [{ id: 'p', offsetMs: null, createdAt: 7 }, { id: 'q', offsetMs: null, createdAt: 7 }];
  assert.deepEqual(orderComments(equal, 'byMoment').map((r) => r.id), ['p', 'q']);
});

test('liked: most likes first, ties newest first, no count counts as 0 (M12 FR-026)', () => {
  const liked = [
    { id: 'a', offsetMs: null, createdAt: 1, likeCount: 2 },
    { id: 'b', offsetMs: 5, createdAt: 2 },
    { id: 'c', offsetMs: null, createdAt: 3, likeCount: 2 },
    { id: 'd', offsetMs: null, createdAt: 4, likeCount: 7 },
    { id: 'e', offsetMs: null, createdAt: 4, likeCount: 7 },
  ];
  assert.deepEqual(orderComments(liked, 'liked').map((r) => r.id), ['d', 'e', 'c', 'a', 'b']);
});

test('smart (M19 FR-042): likes + 2 × replies − hours / 12, ties newest first', () => {
  const now = 100 * 3_600_000;
  const rows = [
    { id: 'old-popular', offsetMs: null, createdAt: now - 48 * 3_600_000, likeCount: 6, replyCount: 1 }, // 6 + 2 − 4 = 4
    { id: 'fresh', offsetMs: null, createdAt: now, likeCount: 1 }, // 1
    { id: 'talked', offsetMs: null, createdAt: now - 12 * 3_600_000, replyCount: 2 }, // 4 − 1 = 3
    { id: 'tie-newer', offsetMs: null, createdAt: now, likeCount: 1 }, // 1, same as fresh
  ];
  assert.deepEqual(orderComments(rows, 'smart', now).map((r) => r.id), ['old-popular', 'talked', 'fresh', 'tie-newer']);
  assert.equal(smartScore({ createdAt: now, likeCount: 3, replyCount: 1 }, now), 5);
});

test('pinned (M19 FR-040): first under every order, the rest in that order', () => {
  const rows = [
    { id: 'a', offsetMs: 10, createdAt: 3, likeCount: 9 },
    { id: 'p', offsetMs: 50, createdAt: 1, pinned: true },
    { id: 'b', offsetMs: 5, createdAt: 2 },
  ];
  for (const order of ['newest', 'liked', 'byMoment', 'smart'] as const) {
    assert.equal(orderComments(rows, order, 10).map((r) => r.id)[0], 'p', order);
  }
  assert.deepEqual(orderComments(rows, 'byMoment').map((r) => r.id), ['p', 'b', 'a']);
});

test('direction (M21 US6): each order has a default; the other direction reverses it; pinned stays first', () => {
  assert.equal(defaultDir('newest'), 'desc');
  assert.equal(defaultDir('liked'), 'desc');
  assert.equal(defaultDir('smart'), 'desc');
  assert.equal(defaultDir('byMoment'), 'asc');
  assert.deepEqual(orderComments(rows, 'newest', 0, 'desc').map((r) => r.id), ['b', 'e', 'a', 'd', 'c']);
  assert.deepEqual(orderComments(rows, 'newest', 0, 'asc').map((r) => r.id), ['c', 'd', 'a', 'e', 'b']);
  assert.deepEqual(orderComments(rows, 'byMoment', 0, 'desc').map((r) => r.id), ['e', 'b', 'a', 'd', 'c']);
  const pinnedRows = [
    { id: 'a', offsetMs: 10, createdAt: 3 },
    { id: 'p', offsetMs: 50, createdAt: 1, pinned: true },
    { id: 'b', offsetMs: 5, createdAt: 2 },
  ];
  assert.deepEqual(orderComments(pinnedRows, 'newest', 0, 'asc').map((r) => r.id), ['p', 'b', 'a']);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c', 'd', 'e'], 'the input is not changed');
});
