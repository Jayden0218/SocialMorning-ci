// Tests the queue sync rule: push, pull, nothing, or ask — and that an empty list never wins silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planQueueSync, sameQueue } from '../src/queue-sync.ts';
import { QUEUE_MAX } from '../src/queue.ts';

test('sameQueue: same ids in the same order only', () => {
  assert.equal(sameQueue([], []), true);
  assert.equal(sameQueue(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameQueue(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameQueue(['a'], ['a', 'b']), false);
});

test('already the same → none, with the server version to remember', () => {
  assert.deepEqual(planQueueSync(['a', 'b'], { items: ['a', 'b'], version: 4 }, undefined), { kind: 'none', version: 4 });
  assert.deepEqual(planQueueSync([], { items: [], version: 0 }, { items: [], version: 0 }), { kind: 'none', version: 0 });
  // Both changed, to the same list: nothing to ask.
  assert.deepEqual(planQueueSync(['x'], { items: ['x'], version: 7 }, { items: ['a'], version: 3 }), { kind: 'none', version: 7 });
});

test('first sync: the non-empty side wins, two different lists ask', () => {
  assert.deepEqual(planQueueSync([], { items: ['s1', 's2'], version: 2 }, undefined), { kind: 'pull', items: ['s1', 's2'], version: 2 });
  assert.deepEqual(planQueueSync(['l1'], { items: [], version: 0 }, undefined), { kind: 'push', items: ['l1'], baseVersion: 0 });
  assert.deepEqual(planQueueSync(['l1'], { items: ['s1'], version: 5 }, undefined), { kind: 'choose', local: ['l1'], server: ['s1'], version: 5 });
});

test('spec edge: 300 here and 0 there — the empty side never silently wins', () => {
  const full = Array.from({ length: QUEUE_MAX }, (_, i) => `e${i}`);
  const first = planQueueSync(full, { items: [], version: 0 }, undefined);
  assert.equal(first.kind, 'push');
  // The account's list was emptied elsewhere while this phone still holds 300: ask.
  const later = planQueueSync(full, { items: [], version: 9 }, { items: full, version: 8 });
  assert.equal(later.kind, 'choose');
  // A local queue over the cap is never sent over it.
  const over = planQueueSync([...full, 'extra'], { items: [], version: 0 }, undefined);
  assert.equal(over.kind === 'push' ? over.items.length : -1, QUEUE_MAX);
});

test('only this phone changed → push on the server version', () => {
  assert.deepEqual(planQueueSync(['a', 'b', 'c'], { items: ['a', 'b'], version: 3 }, { items: ['a', 'b'], version: 3 }), { kind: 'push', items: ['a', 'b', 'c'], baseVersion: 3 });
  // Clearing the queue here is a real change and goes up.
  assert.deepEqual(planQueueSync([], { items: ['a'], version: 3 }, { items: ['a'], version: 3 }), { kind: 'push', items: [], baseVersion: 3 });
});

test('only the account changed → pull', () => {
  assert.deepEqual(planQueueSync(['a'], { items: ['a', 'z'], version: 4 }, { items: ['a'], version: 3 }), { kind: 'pull', items: ['a', 'z'], version: 4 });
  // An empty phone takes an emptied account's list without asking (nothing to lose).
  assert.deepEqual(planQueueSync([], { items: ['q'], version: 6 }, { items: [], version: 5 }), { kind: 'pull', items: ['q'], version: 6 });
});

test('both changed and differ → choose, both lists shown', () => {
  assert.deepEqual(
    planQueueSync(['a', 'mine'], { items: ['a', 'theirs'], version: 4 }, { items: ['a'], version: 3 }),
    { kind: 'choose', local: ['a', 'mine'], server: ['a', 'theirs'], version: 4 },
  );
});
