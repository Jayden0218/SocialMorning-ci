// Tests the made-for-you cover's letters, colour, address and contrast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COVER_TONES, autoCoverUrl, coverLetters, coverTone, coverToneIndex, isAutoCover, parseAutoCover } from '../src/cover.ts';

test('letters: 2 characters for Chinese, initials of 2 words, or 2 letters of one word', () => {
  assert.equal(coverLetters('晚间漫谈'), '晚间');
  assert.equal(coverLetters('  《晚 间》漫谈 '), '晚间');
  assert.equal(coverLetters('Late Walks'), 'LW');
  assert.equal(coverLetters('the morning ledger'), 'TM');
  assert.equal(coverLetters('Serial'), 'SE');
  assert.equal(coverLetters('X'), 'X');
  assert.equal(coverLetters('99% Invisible'), '9I');
  assert.equal(coverLetters('!!! ...'), '');
  assert.equal(coverLetters(''), '');
});

test('colour: the same name always gets the same one of 7, whatever the case or spaces', () => {
  const i = coverToneIndex('Late Walks');
  assert.ok(i >= 0 && i < COVER_TONES.length);
  assert.equal(coverToneIndex('  late walks '), i);
  assert.deepEqual(coverTone('Late Walks'), COVER_TONES[i]);
  const seen = new Set(Array.from({ length: 200 }, (_, n) => coverToneIndex(`Show ${n}`)));
  assert.equal(seen.size, COVER_TONES.length, 'every colour is used');
});

test('address: ASCII, round-trips to the same tile, and is recognised as drawn', () => {
  const url = autoCoverUrl('https://api.example/', '晚间漫谈');
  assert.match(url, /^https:\/\/api\.example\/covers\/auto\/v1\/\d-665a-95f4\.png$/);
  assert.ok(isAutoCover(url));
  const file = url.split('/').pop()!;
  assert.deepEqual(parseAutoCover(file), { tone: coverTone('晚间漫谈'), letters: '晚间' });
  assert.deepEqual(parseAutoCover(autoCoverUrl('https://a', '!!!').split('/').pop()!), { tone: coverTone('!!!'), letters: '' });
  assert.equal(isAutoCover('https://blob.example/covers/abc/cover.png'), false);
  assert.equal(isAutoCover(null), false);
  assert.equal(isAutoCover(undefined), false);
});

test('a file name the server did not make is refused', () => {
  assert.equal(parseAutoCover('3-4c-57.jpg'), undefined);
  assert.equal(parseAutoCover('3-4c-57-41.png'), undefined, 'more than 2 letters');
  assert.equal(parseAutoCover('9-4c.png'), undefined, 'no colour 9');
  assert.equal(parseAutoCover('3-ffffff.png'), undefined, 'past the last code point');
  assert.equal(parseAutoCover('3-20.png'), undefined, 'a space is not a letter');
  assert.equal(parseAutoCover('3-3c.png'), undefined, '"<" is not a letter');
  assert.deepEqual(parseAutoCover('3-4c-57.png'), { tone: COVER_TONES[3], letters: 'LW' });
});

/** WCAG 2 relative luminance and contrast. */
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); };

test('every ink reads on its fill at ≥ 3:1 (the letters are large text)', () => {
  for (const t of COVER_TONES) assert.ok(contrast(t.fill, t.ink) >= 3, `${t.ink} on ${t.fill}: ${contrast(t.fill, t.ink).toFixed(2)}`);
});
