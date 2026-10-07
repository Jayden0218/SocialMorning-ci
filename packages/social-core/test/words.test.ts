// Tests the blocked-words filter: whole Latin words, Chinese anywhere, folding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBlockedWord, normaliseText, normaliseWord, WORD_MAX, WORDS_MAX } from '../src/words.ts';

test('M24 US2: normaliseWord folds case, width and spaces; empty or too long is undefined', () => {
  assert.equal(normaliseWord('  Bad   Word '), 'bad word');
  assert.equal(normaliseWord('ＢＡＤ'), 'bad'); // full-width letters
  assert.equal(normaliseWord('   '), undefined);
  assert.equal(normaliseWord('x'.repeat(WORD_MAX)), 'x'.repeat(WORD_MAX));
  assert.equal(normaliseWord('x'.repeat(WORD_MAX + 1)), undefined);
  assert.equal(normaliseText(' A\n B '), 'a b');
  assert.equal(WORDS_MAX, 2000);
});

test('M24 US2: a Latin word matches only as a whole word; other words match anywhere', () => {
  const words = ['ass', 'spam link', '傻瓜', ''];
  assert.equal(findBlockedWord('a first-class show', words), undefined, 'not inside a longer word');
  assert.equal(findBlockedWord('what an ASS', words), 'ass');
  assert.equal(findBlockedWord('ass.', words), 'ass');
  assert.equal(findBlockedWord('click my Spam   Link now', words), 'spam link');
  assert.equal(findBlockedWord('你是傻瓜吗', words), '傻瓜', 'Chinese has no spaces: anywhere');
  assert.equal(findBlockedWord('', words), undefined);
  assert.equal(findBlockedWord('hello', []), undefined);
  assert.equal(findBlockedWord('a+b', ['a+b']), 'a+b', 'symbols are escaped, matched anywhere');
});
