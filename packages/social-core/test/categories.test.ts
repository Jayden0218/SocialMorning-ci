import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPLE_CATEGORIES, CATEGORY_NAMES, categoryId, categoryName } from '../src/index.ts';

test('drift guard: the category ids are exactly Apple\'s 19, in order', () => {
  assert.deepEqual(
    APPLE_CATEGORIES.map((c) => c.id),
    [1301, 1321, 1303, 1304, 1483, 1511, 1487, 1512, 1305, 1502, 1310, 1489, 1314, 1533, 1324, 1545, 1318, 1488, 1309],
  );
  assert.deepEqual(CATEGORY_NAMES, APPLE_CATEGORIES.map((c) => c.name));
});

test('ids and names are unique and every id has a name', () => {
  assert.equal(new Set(APPLE_CATEGORIES.map((c) => c.id)).size, APPLE_CATEGORIES.length);
  assert.equal(new Set(APPLE_CATEGORIES.map((c) => c.name)).size, APPLE_CATEGORIES.length);
  for (const c of APPLE_CATEGORIES) {
    assert.ok(c.name.length > 0);
    assert.equal(categoryName(c.id), c.name);
    assert.equal(categoryId(c.name), c.id);
  }
});

test('lookups: case, spaces and &amp; are forgiven; unknowns are undefined', () => {
  assert.equal(categoryId('  tv &amp; film '), 1309);
  assert.equal(categoryId('HEALTH & FITNESS'), 1512);
  assert.equal(categoryId('Cooking'), undefined);
  assert.equal(categoryName(1), undefined);
});
