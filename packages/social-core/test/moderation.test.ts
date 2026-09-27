import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionsFor, closeReason, DELETED_REPORTER, groupReports, REPORTS_PER_HOUR, RETENTION_DAYS } from '../src/moderation.ts';

test('A2: groupReports — one item per target, newest activity first, count, reasons deduped, first-at, the earliest snapshot, a deleted reporter named', () => {
  const rows = [
    { targetKind: 'comment' as const, targetId: 'c1', reporterId: 'a', reporterName: 'Al', reason: 'spam', note: null, snapshot: { body: 'v1' }, createdAt: 100 },
    { targetKind: 'clip' as const, targetId: 'k1', reporterId: 'b', reporterName: 'Bea', reason: 'hate', note: 'ugh', snapshot: { caption: 'x' }, createdAt: 150 },
    { targetKind: 'comment' as const, targetId: 'c1', reporterId: null, reporterName: null, reason: 'spam', note: 'again', snapshot: { body: 'v2' }, createdAt: 200 },
    { targetKind: 'comment' as const, targetId: 'c1', reporterId: 'c', reporterName: 'Cee', reason: 'harassment', note: null, snapshot: { body: 'v3' }, createdAt: 120 },
  ];
  const q = groupReports(rows);
  assert.equal(q.length, 2);
  assert.equal(q[0]!.targetId, 'c1');
  assert.equal(q[0]!.count, 3);
  assert.equal(q[0]!.firstAt, 100);
  assert.equal(q[0]!.latestAt, 200);
  assert.deepEqual(q[0]!.reasons, ['spam', 'harassment']);
  assert.deepEqual(q[0]!.reporters, ['Al', 'Cee', DELETED_REPORTER]);
  assert.deepEqual(q[0]!.notes, ['again']);
  assert.deepEqual(q[0]!.snapshot, { body: 'v1' });
  assert.equal(q[1]!.targetId, 'k1');
  assert.deepEqual(q[1]!.notes, ['ugh']);
  assert.deepEqual(groupReports([]), []);
});

test('A2: actionsFor per kind; closeReason; constants', () => {
  assert.deepEqual(actionsFor('comment'), ['dismiss', 'remove', 'suspend']);
  assert.deepEqual(actionsFor('clip'), ['dismiss', 'remove', 'suspend']);
  assert.deepEqual(actionsFor('profile'), ['dismiss', 'suspend']);
  assert.deepEqual(actionsFor('show'), ['dismiss', 'hide_show']);
  assert.equal(closeReason(true, false), 'already_gone');
  assert.equal(closeReason(false, true), 'author_deleted');
  assert.equal(closeReason(false, false), 'open');
  assert.equal(RETENTION_DAYS, 90);
  assert.equal(REPORTS_PER_HOUR, 20);
});
