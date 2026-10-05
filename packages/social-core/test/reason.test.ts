// Tests every reason stays under the length limit and long titles use short form.
/**
 * M8 (quickstart A7) — the reason on every row.
 *
 * The interesting case is the long one. A reason that has been shortened must still be
 * TRUE, so shortening drops the whole clause rather than cutting mid-fact. "Because you
 * follow The Incredibly Long…" is not a fact; "Like a show you follow" is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reasonFor, REASON_MAX } from '../src/reason.ts';
import { CHANNELS } from '../src/rank.ts';

test('A7: every channel produces a reason, and none of them is longer than the limit', () => {
  for (const ch of CHANNELS) {
    const r = reasonFor(ch, { showTitle: 'Reply All', genreName: 'Technology', neighbourOf: '99% Invisible', socialCount: 3 });
    assert.ok(r.length > 0 && r.length <= REASON_MAX, `${ch}: ${r.length} chars`);
    assert.ok(!r.includes('undefined'), `${ch} leaked an undefined`);
  }
});

test('A7: a 12-word show title falls back to the short form rather than being cut', () => {
  const huge = 'The Incredibly Long And Self Indulgent Podcast About Absolutely Everything Ever';
  assert.equal(reasonFor('sub-new', { showTitle: huge }), 'New from a show you follow');
  assert.equal(reasonFor('showcf', { showTitle: 'x', neighbourOf: huge }), 'Like a show you follow');
  assert.equal(reasonFor('genre', { showTitle: 'x', genreName: huge }), 'New in a category you listen to');
  // …and a short one keeps the specific, more useful wording.
  assert.equal(reasonFor('sub-new', { showTitle: 'Reply All' }), 'New from Reply All');
  assert.equal(reasonFor('showcf', { showTitle: 'x', neighbourOf: '99% Invisible' }), 'Because you follow 99% Invisible');
  assert.equal(reasonFor('genre', { showTitle: 'x', genreName: 'Technology' }), 'New in Technology');
});

test('A7: a reason states a count, never a name', () => {
  assert.equal(reasonFor('social', { showTitle: 'x', socialCount: 1 }), '1 person you follow listened');
  assert.equal(reasonFor('social', { showTitle: 'x', socialCount: 4 }), '4 people you follow listened');
  assert.equal(reasonFor('social', { showTitle: 'x', socialCount: 0 }), 'People you follow listened');
  assert.equal(reasonFor('social', { showTitle: 'x' }), 'People you follow listened');
});

test('A7: the channels with nothing to vary say one fixed true thing', () => {
  assert.equal(reasonFor('talked', { showTitle: 'x' }), 'Talked about this week');
  assert.equal(reasonFor('pick', { showTitle: 'x' }), 'Picked today');
  assert.equal(reasonFor('chart', { showTitle: 'x' }), 'Climbing the chart');
  assert.equal(reasonFor('showcf', { showTitle: 'x' }), 'Like a show you follow');
  assert.equal(reasonFor('genre', { showTitle: 'x' }), 'New in a category you listen to');
});

test('owner 2026-10-05: rows of one channel take turns through true wordings; no variant is the first', () => {
  const seen = [0, 1, 2, 3, 4, 5].map((variant) => reasonFor('sub-new', { showTitle: 'Reply All', variant }));
  assert.equal(new Set(seen).size, 6, seen.join(' | '));
  assert.ok(seen.every((r) => r.includes('Reply All') && r.length <= REASON_MAX));
  assert.equal(reasonFor('sub-new', { showTitle: 'Reply All', variant: 6 }), 'New from Reply All', 'wraps round');
  for (const ch of CHANNELS) {
    for (let variant = 0; variant < 8; variant++) {
      const r = reasonFor(ch, { showTitle: 'Reply All', genreName: 'Technology', neighbourOf: '99% Invisible', socialCount: 2, variant });
      assert.ok(r.length > 0 && r.length <= REASON_MAX && !r.includes('undefined'), `${ch}/${variant}: ${r}`);
    }
  }
  // A long title still falls back to the short form, whatever the wording.
  const huge = 'The Incredibly Long And Self Indulgent Podcast About Absolutely Everything Ever';
  assert.equal(reasonFor('sub-new', { showTitle: huge, variant: 3 }), 'New from a show you follow');
  assert.equal(reasonFor('social', { showTitle: 'x', socialCount: 1, variant: 1 }), 'Heard by 1 person you follow');
});
