// Tests speed is kept in range and a show's speed beats the default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampRate, clearShowRate, fractionOfRate, hasShowRate, rateAtFraction, rateFor } from '../src/speed.ts';

/**
 * M21 US2 (spec story 2, scenario 3): "This show only" off clears the show's speed, so another
 * episode of it — and every other show — plays at the default.
 * The break that turns it red: make `clearShowRate` return `new Map(prefs)` without the delete.
 */
test('M21: clearShowRate drops the show, leaves the others and the input alone; rateFor then gives the default', () => {
  const prefs = new Map([['https://a/feed.xml', 1.5], ['https://b/feed.xml', 2]]);
  assert.equal(hasShowRate('https://a/feed.xml', prefs), true);
  const next = clearShowRate(prefs, 'https://a/feed.xml');
  assert.equal(hasShowRate('https://a/feed.xml', next), false);
  assert.equal(rateFor('https://a/feed.xml', next, 1.2), 1.2);
  assert.equal(rateFor('https://b/feed.xml', next, 1.2), 2);
  assert.equal(prefs.get('https://a/feed.xml'), 1.5, 'the input is not changed');
});

test('M21: the slider maps 0..1 to 0.5..3.0 in 0.1 steps and back; out of range and NaN are held', () => {
  assert.equal(rateAtFraction(0), 0.5);
  assert.equal(rateAtFraction(1), 3);
  assert.equal(rateAtFraction(0.2), 1);
  assert.equal(rateAtFraction(0.21), 1);
  assert.equal(rateAtFraction(-1), 0.5);
  assert.equal(rateAtFraction(7), 3);
  assert.equal(rateAtFraction(Number.NaN), 0.5);
  assert.equal(fractionOfRate(0.5), 0);
  assert.equal(fractionOfRate(3), 1);
  assert.ok(Math.abs(fractionOfRate(1) - 0.2) < 1e-9);
});

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
