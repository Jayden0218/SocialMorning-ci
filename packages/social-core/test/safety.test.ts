import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBlocks, canBlock, canReport, hiddenKey, REPORT_REASONS, TARGET_KINDS } from '../src/safety.ts';

test('A1: canReport — signed out → sign_in; own content → own; else ok (FR-004)', () => {
  assert.equal(canReport(undefined, 'a'), 'sign_in');
  assert.equal(canReport('a', 'a'), 'own');
  assert.equal(canReport('a', 'b'), 'ok');
  assert.equal(canReport('a', null), 'ok'); // a show has no author
  assert.equal(REPORT_REASONS.length, 7);
  assert.deepEqual(TARGET_KINDS, ['comment', 'clip', 'profile', 'show']);
});

test('A1: canBlock — signed out, self, the owner refused; the owner unset → ok', () => {
  assert.equal(canBlock(undefined, 'b', 'o'), 'sign_in');
  assert.equal(canBlock('a', 'a', 'o'), 'self');
  assert.equal(canBlock('a', 'o', 'o'), 'owner');
  assert.equal(canBlock('a', 'b', 'o'), 'ok');
  assert.equal(canBlock('a', 'b', undefined), 'ok');
  assert.equal(hiddenKey('comment', 'x'), 'comment\u0001x');
});

test('A1: a reported item stays as a "reported" placeholder (FR-002); a blocked author is dropped; a blocked reply under a kept parent is a "blocked" placeholder (G2)', () => {
  const items = [
    { id: 't1', authorId: 'A', parentId: null, key: hiddenKey('comment', 't1') },
    { id: 'r1', authorId: 'B', parentId: 't1' },              // blocked reply under a visible parent → placeholder
    { id: 't2', authorId: 'B', parentId: null },              // blocked top-level → dropped
    { id: 'r2', authorId: 'C', parentId: 't2' },              // visible reply under a dropped parent: kept as-is (the caller decides)
    { id: 't3', authorId: 'C', parentId: null, key: hiddenKey('comment', 't3') }, // reported → a 'reported' placeholder, in place (FR-002)
    { id: 'r3', authorId: 'B', parentId: 't3' },              // blocked reply; its parent is kept (as a placeholder), so this is a 'blocked' placeholder
    { id: 't4', authorId: null, parentId: null },             // deleted placeholder: no author → kept
  ];
  const out = applyBlocks(items, new Set(['B']), new Set([hiddenKey('comment', 't3')]));
  assert.deepEqual(out.map((i) => ('placeholder' in i ? `${i.placeholder}:${i.id}` : i.id)), ['t1', 'blocked:r1', 'r2', 'reported:t3', 'blocked:r3', 't4']);
  assert.deepEqual(out[1], { placeholder: 'blocked', id: 'r1', parentId: 't1' });
  assert.deepEqual(out[3], { placeholder: 'reported', id: 't3', parentId: null });
  // A reply under a reported parent that the viewer also blocked: the parent stays (as a placeholder), so the reply does too.
  assert.deepEqual(out.filter((i) => 'placeholder' in i && i.id === 'r3'), [{ placeholder: 'blocked', id: 'r3', parentId: 't3' }]);
  assert.deepEqual(applyBlocks(items, new Set(), new Set()), items);
  // A report the viewer made on their own-side wins over a block of the same item.
  assert.deepEqual(applyBlocks([{ id: 'x', authorId: 'B', parentId: null, key: hiddenKey('comment', 'x') }], new Set(['B']), new Set([hiddenKey('comment', 'x')])),
    [{ placeholder: 'reported', id: 'x', parentId: null }]);
});
