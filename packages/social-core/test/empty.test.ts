import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATES, emptyState, ERROR_SENTENCE, GIVE_UP_AFTER_MS, LOADING_AFTER_MS, OFFLINE_SENTENCE, SURFACES } from '../src/empty.ts';

test('A3 / G10: every one of the 13 surfaces has a sentence and an action with a route', () => {
  assert.equal(SURFACES.length, 13);
  for (const s of SURFACES) {
    const e = EMPTY_STATES[s];
    assert.ok(e.sentence.length > 10, `${s} sentence`);
    assert.ok(e.action.label.length > 0 && e.action.route.startsWith('/'), `${s} action`);
  }
  assert.match(EMPTY_STATES.heat.sentence, /♡/);
});

test('A3: emptyState — quiet under 1 s, loading from 1 s, error at 10 s; offline without cache → offline; with cache → quiet; else the surface\'s sentence', () => {
  assert.deepEqual(emptyState('queue', { offline: false, hasCache: false, loadingMs: 200 }), { kind: 'quiet' });
  assert.deepEqual(emptyState('queue', { offline: false, hasCache: false, loadingMs: LOADING_AFTER_MS }), { kind: 'loading' });
  assert.deepEqual(emptyState('queue', { offline: false, hasCache: false, loadingMs: GIVE_UP_AFTER_MS }), { kind: 'error', sentence: ERROR_SENTENCE, retry: true });
  assert.deepEqual(emptyState('queue', { offline: false, hasCache: false, failed: true }), { kind: 'error', sentence: ERROR_SENTENCE, retry: true });
  assert.deepEqual(emptyState('feed', { offline: true, hasCache: false }), { kind: 'offline', sentence: OFFLINE_SENTENCE, retry: true });
  assert.deepEqual(emptyState('feed', { offline: true, hasCache: true }), { kind: 'empty', sentence: EMPTY_STATES.feed.sentence, action: EMPTY_STATES.feed.action });
  assert.deepEqual(emptyState('feed', { offline: false, hasCache: true, failed: true }), { kind: 'empty', sentence: EMPTY_STATES.feed.sentence, action: EMPTY_STATES.feed.action });
  assert.deepEqual(emptyState('inbox', { offline: false, hasCache: false }), { kind: 'empty', sentence: EMPTY_STATES.inbox.sentence, action: EMPTY_STATES.inbox.action });
});
