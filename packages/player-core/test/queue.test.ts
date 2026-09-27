import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, move, nextPlayable, QUEUE_MAX, remove } from '../src/queue.ts';

// quickstart A1 — guard G1
test('A1: 301st at the end is refused; at the front the last is evicted', () => {
  let q: readonly string[] = [];
  for (let i = 0; i < QUEUE_MAX; i++) q = enqueue(q, `e${i}`, 'end').queue;
  assert.equal(q.length, 300);
  const refused = enqueue(q, 'e300', 'end');
  assert.equal(refused.refused, 'full');
  assert.equal(refused.queue, q, 'unchanged');
  const front = enqueue(q, 'e300', 'front');
  assert.equal(front.queue.length, 300);
  assert.equal(front.queue[0], 'e300');
  assert.equal(front.evicted, 'e299');
});

test('enqueue moves an already-queued episode instead of duplicating; move and remove', () => {
  const q = enqueue(enqueue(['a', 'b', 'c'], 'a', 'end').queue, 'c', 'front').queue;
  assert.deepEqual(q, ['c', 'b', 'a']);
  assert.deepEqual(move(q, 'a', 0), ['a', 'c', 'b']);
  assert.deepEqual(move(q, 'c', 99), ['b', 'a', 'c']);
  assert.equal(move(q, 'zz', 0), q, 'unknown id: same array');
  assert.equal(move(q, 'c', 0), q, 'no-op move: same array');
  assert.deepEqual(remove(q, 'b'), ['c', 'a']);
  assert.equal(remove(q, 'zz'), q);
});

// quickstart A2 — guard G2
test('A2: offline, an undownloaded item is skipped and stays; online, the first plays', () => {
  const q = ['u', 'd', 'x'];
  const downloads = [{ episodeId: 'd', state: 'complete' as const }, { episodeId: 'u', state: 'waiting' as const }];
  assert.deepEqual(nextPlayable(q, downloads, false), { next: 'd', skipped: ['u'] });
  assert.deepEqual(q, ['u', 'd', 'x'], 'queue untouched');
  assert.deepEqual(nextPlayable(q, downloads, true), { next: 'u', skipped: [] });
  assert.deepEqual(nextPlayable(['u', 'x'], downloads, false), { skipped: ['u', 'x'] });
  assert.deepEqual(nextPlayable([], downloads, true), { skipped: [] });
});
