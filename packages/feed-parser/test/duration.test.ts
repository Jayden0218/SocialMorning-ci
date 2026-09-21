import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseDateMs, parseDurationMs } from '../src/duration';

test('reads every duration shape real feeds publish', () => {
  assert.equal(parseDurationMs('3723'), 3_723_000, 'plain seconds');
  assert.equal(parseDurationMs('1:02:03'), 3_723_000, 'H:MM:SS');
  assert.equal(parseDurationMs('02:03'), 123_000, 'MM:SS');
  assert.equal(parseDurationMs('1:02:03.5'), 3_723_500, 'fractional seconds');
  assert.equal(parseDurationMs('12.5'), 12_500, 'fractional plain seconds');
  assert.equal(parseDurationMs('0'), 0, 'zero is a value, not an absence');
  assert.equal(parseDurationMs(' 90 '), 90_000, 'surrounding whitespace');
});

test('accepts minutes over sixty, because real feeds publish them', () => {
  // `0:75:00` means 75 minutes. Bounding each field to 0-59 would reject a
  // duration that is perfectly recoverable.
  assert.equal(parseDurationMs('0:75:00'), 4_500_000);
});

test('refuses what it cannot read rather than inventing a number', () => {
  for (const input of ['about an hour', '', '   ', 'NaN', '-1', '-1:00', 'abc:def']) {
    assert.equal(parseDurationMs(input), undefined, `should refuse ${JSON.stringify(input)}`);
  }
  assert.equal(parseDurationMs(undefined), undefined);
  assert.equal(parseDurationMs(null), undefined);
});

test('an empty colon field is malformed, not zero', () => {
  // Number('') is 0, so a naive parser reads `1::03` as 3603 seconds and is
  // confidently wrong. This is the assertion that pins the guard.
  assert.equal(parseDurationMs('1::03'), undefined);
});

test('refuses colon forms with no agreed meaning', () => {
  assert.equal(parseDurationMs('1:2:3:4'), undefined, 'four fields');
  assert.equal(parseDurationMs(':'), undefined);
});

test('reads both date formats and refuses prose', () => {
  assert.equal(parseDateMs('Tue, 10 Sep 2024 09:00:00 GMT'), Date.UTC(2024, 8, 10, 9));
  assert.equal(parseDateMs('2024-09-11T09:00:00Z'), Date.UTC(2024, 8, 11, 9));
  assert.equal(parseDateMs('sometime last Tuesday'), undefined);
  assert.equal(parseDateMs(''), undefined);
  assert.equal(parseDateMs(undefined), undefined);
});
