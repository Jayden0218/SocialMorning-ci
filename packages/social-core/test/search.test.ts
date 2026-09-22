import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseByFeed, matchesTerm, mergeSearch, normaliseFeedUrl } from '../src/search.ts';

test('A5: matchesTerm — every token somewhere in the texts, case-insensitive; empty term false; undefined texts skipped', () => {
  assert.equal(matchesTerm('casey believe', 'Casey Wants to Believe', 'Reply All'), true);
  assert.equal(matchesTerm('CASEY reply', 'Casey Wants to Believe', 'Reply All'), true);
  assert.equal(matchesTerm('casey gimlet', 'Casey Wants to Believe', undefined), false);
  assert.equal(matchesTerm('   ', 'anything'), false);
  assert.equal(matchesTerm('x', undefined), false);
});

test('A5: collapseByFeed keeps the first of duplicate feeds (trailing slash, scheme case ignored)', () => {
  const shows = [{ feedUrl: 'https://feeds.x/a', n: 1 }, { feedUrl: 'https://feeds.x/a/', n: 2 }, { feedUrl: 'HTTPS://feeds.x/a', n: 3 }, { feedUrl: 'https://feeds.x/b', n: 4 }];
  assert.deepEqual(collapseByFeed(shows).map((s) => s.n), [1, 4]);
  assert.equal(normaliseFeedUrl(' HTTPS://feeds.x/a// '), 'https://feeds.x/a');
});

test('A5: mergeSearch — library first; a catalogue show or episode already in the library is dropped (G5)', () => {
  const library = { shows: [{ feedUrl: 'https://feeds.x/a', t: 'lib A' }], episodes: [{ feedUrl: 'https://feeds.x/a', guid: 'g1', t: 'lib g1' }] };
  const catalogue = {
    shows: [{ feedUrl: 'https://feeds.x/a/', t: 'cat A' }, { feedUrl: 'https://feeds.x/b', t: 'cat B' }, { feedUrl: 'https://feeds.x/b', t: 'cat B dup' }],
    episodes: [{ feedUrl: 'https://feeds.x/a', guid: 'g1', t: 'cat g1' }, { feedUrl: 'https://feeds.x/a', guid: 'g2', t: 'cat g2' }],
  };
  const m = mergeSearch(library, catalogue);
  assert.deepEqual(m.shows.map((s) => s.t), ['lib A', 'cat B']);
  assert.deepEqual(m.episodes.map((e) => e.t), ['lib g1', 'cat g2']);
});
