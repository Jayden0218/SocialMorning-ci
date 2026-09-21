import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listenItemDue, orderFeed, unreadCount } from '../src/feed.ts';

test('A5: listenItemDue on crossing 5 min, on finishing, never again after', () => {
  assert.equal(listenItemDue(299_000, 300_000, false, false), true);
  assert.equal(listenItemDue(0, 10_000, false, true), true);
  assert.equal(listenItemDue(300_000, 400_000, false, false), false);
  assert.equal(listenItemDue(0, 10_000, true, true), false);     // was already finished
  assert.equal(listenItemDue(0, 10_000, false, false), false);
});

test('A5: orderFeed newest first, ties by id desc, input untouched', () => {
  const items = [{ id: 1, createdAt: 5 }, { id: 3, createdAt: 9 }, { id: 2, createdAt: 9 }];
  assert.deepEqual(orderFeed(items).map((i) => i.id), [3, 2, 1]);
  assert.deepEqual(items.map((i) => i.id), [1, 3, 2]);
});

test('A5: unreadCount counts items newer than the mark; everything when never opened', () => {
  const items = [{ createdAt: 5 }, { createdAt: 9 }, { createdAt: 12 }];
  assert.equal(unreadCount(items, 9), 1);
  assert.equal(unreadCount(items, undefined), 3);
});
