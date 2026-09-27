import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderComments } from '../src/order.ts';

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
