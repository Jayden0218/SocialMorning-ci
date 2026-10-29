// Tests the typed field readers in db/ddb/codec.ts (M32 D3): null, undefined and wrong types are named, never turned into "undefined" or NaN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { str, optStr, num, optNum, bool, optBool, decoder, CodecError } from '../src/db/ddb/codec.ts';

test('str: a string, or a number written out; null, undefined and other types throw naming the field', () => {
  assert.equal(str({ a: 'x' }, 'a'), 'x');
  assert.equal(str({ a: '' }, 'a'), '');
  assert.equal(str({ a: 7 }, 'a'), '7');
  for (const bad of [undefined, null, true, {}, [], new Set(['a'])]) {
    assert.throws(() => str({ a: bad }, 'a'), (e: Error) => e instanceof CodecError && /field "a": expected string/.test(e.message));
  }
  assert.throws(() => str({}, 'missing'), /field "missing"/);
});

test('optStr: null for absent or null, the string otherwise, a wrong type throws', () => {
  assert.equal(optStr({}, 'a'), null);
  assert.equal(optStr({ a: null }, 'a'), null);
  assert.equal(optStr({ a: 's' }, 'a'), 's');
  assert.throws(() => optStr({ a: {} }, 'a'), CodecError);
});

test('num / optNum: finite numbers and numeric strings; NaN, Infinity, junk throw', () => {
  assert.equal(num({ a: 3 }, 'a'), 3);
  assert.equal(num({ a: 0 }, 'a'), 0);
  assert.equal(num({ a: '4.5' }, 'a'), 4.5);
  for (const bad of [undefined, null, NaN, Infinity, 'abc', '', true]) assert.throws(() => num({ a: bad }, 'a'), CodecError);
  assert.equal(optNum({}, 'a'), null);
  assert.equal(optNum({ a: null }, 'a'), null);
  assert.equal(optNum({ a: 0 }, 'a'), 0);
  assert.throws(() => optNum({ a: 'x' }, 'a'), CodecError);
});

test('bool / optBool', () => {
  assert.equal(bool({ a: false }, 'a'), false);
  assert.throws(() => bool({ a: 'true' }, 'a'), CodecError);
  assert.throws(() => bool({}, 'a'), CodecError);
  assert.equal(optBool({}, 'a'), false);
  assert.equal(optBool({ a: null }, 'a'), false);
  assert.equal(optBool({ a: true }, 'a'), true);
  assert.throws(() => optBool({ a: 1 }, 'a'), CodecError);
});

test('decoder builds a typed row from a field spec and names the field that fails', () => {
  const row = decoder({ id: 'str', note: 'optStr', n: 'num', at: 'optNum', on: 'optBool' });
  const out = row({ id: 'e1', n: 2, extra: 'ignored' });
  assert.deepEqual(out, { id: 'e1', note: null, n: 2, at: null, on: false });
  assert.throws(() => row({ id: 'e1', n: 'x' }), /field "n"/);
  assert.throws(() => row({ n: 1 }), /field "id"/);
});
