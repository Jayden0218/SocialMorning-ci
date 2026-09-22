import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillWithTrending, rankTalkedAbout, scoreTalkedAbout } from '../src/discover.ts';

const row = (key: string, l: number, c: number, k: number, r: number, newestAt = 0) => ({ key, listeners: l, comments: c, clips: k, reactions: r, newestAt });

test('A3: score is 3L + 2C + 2K + 1R; ranked desc, ties by newest; score 0 dropped; capped', () => {
  assert.equal(scoreTalkedAbout(row('x', 1, 1, 1, 1)), 8);
  const ranked = rankTalkedAbout([row('a', 0, 0, 0, 0), row('b', 1, 0, 0, 0, 5), row('c', 0, 1, 0, 1, 9), row('d', 0, 0, 0, 3, 1), row('e', 0, 1, 0, 1, 2)], 3);
  assert.deepEqual(ranked.map((r) => r.key), ['c', 'e', 'b']); // c and e tie at 3 → newest first; b and d tie at 3 too → by newestAt 5 > 1
});

test('A3: fillWithTrending appends only until min, skipping keys already present', () => {
  const items = [{ key: 'a' }, { key: 'b' }];
  const trending = [{ key: 'b' }, { key: 'c' }, { key: 'd' }, { key: 'e' }, { key: 'f' }];
  assert.deepEqual(fillWithTrending(items, trending, 5).map((i) => i.key), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(fillWithTrending(items, trending, 2).map((i) => i.key), ['a', 'b']);
  assert.deepEqual(fillWithTrending([], [], 5), []);
});
