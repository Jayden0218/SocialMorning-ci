import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampRate, rateFor } from '../src/speed.ts';

// quickstart A4 — guard G4
test('A4: clampRate(3.7)=3.0, (0.44)=0.5, (1.23)=1.2; NaN → 1', () => {
  assert.equal(clampRate(3.7), 3.0);
  assert.equal(clampRate(0.44), 0.5);
  assert.equal(clampRate(1.23), 1.2);
  assert.equal(clampRate(1.25), 1.3);
  assert.equal(clampRate(Number.NaN), 1);
});

test('A4: a show pref of 1.5 wins over a default of 1.2; no pref → the default, clamped', () => {
  const prefs = new Map([['https://a/feed.xml', 1.5]]);
  assert.equal(rateFor('https://a/feed.xml', prefs, 1.2), 1.5);
  assert.equal(rateFor('https://b/feed.xml', prefs, 1.2), 1.2);
  assert.equal(rateFor('https://b/feed.xml', prefs, 9), 3.0);
});
