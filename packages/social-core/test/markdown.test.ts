// Tests the Markdown subset: headings, paragraphs, lists, bold, https links — and HTML stays text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInline, parseMarkdown, plainText, sectionsOf } from '../src/markdown.ts';

test('inline: bold, an https link, anything else stays text', () => {
  assert.deepEqual(parseInline('a **b** [c](https://x.example/p) d'), [
    { t: 'text', v: 'a ' }, { t: 'bold', v: 'b' }, { t: 'text', v: ' ' }, { t: 'link', v: 'c', href: 'https://x.example/p' }, { t: 'text', v: ' d' },
  ]);
  assert.deepEqual(parseInline('[x](javascript:alert(1))'), [{ t: 'text', v: '[x](javascript:alert(1)' }, { t: 'text', v: ')' }]);
  assert.deepEqual(parseInline('**b**'), [{ t: 'bold', v: 'b' }]);
  assert.deepEqual(parseInline(''), []);
});

test('blocks: headings, paragraphs joined, lists of both kinds, a list ended by text or a blank line', () => {
  const md = '# Top\n## Two\n### Three\nline one\r\nline two\n\n- a\n* b\n1. c\n2) d\nafter\n- e\n\n- f';
  assert.deepEqual(parseMarkdown(md), [
    { t: 'h2', v: [{ t: 'text', v: 'Top' }] },
    { t: 'h2', v: [{ t: 'text', v: 'Two' }] },
    { t: 'h3', v: [{ t: 'text', v: 'Three' }] },
    { t: 'p', v: [{ t: 'text', v: 'line one line two' }] },
    { t: 'ul', items: [[{ t: 'text', v: 'a' }], [{ t: 'text', v: 'b' }]] },
    { t: 'ol', items: [[{ t: 'text', v: 'c' }], [{ t: 'text', v: 'd' }]] },
    { t: 'p', v: [{ t: 'text', v: 'after' }] },
    { t: 'ul', items: [[{ t: 'text', v: 'e' }]] },
    { t: 'ul', items: [[{ t: 'text', v: 'f' }]] },
  ]);
});

test('guard: a <script> in a body is plain text in the result, never markup', () => {
  const blocks = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  assert.deepEqual(blocks, [
    { t: 'p', v: [{ t: 'text', v: '<script>alert(1)</script>' }] },
    { t: 'p', v: [{ t: 'text', v: '<img src=x onerror=alert(1)>' }] },
  ]);
});

test('sections: split at ## headings; text before the first heading has an empty heading', () => {
  const s = sectionsOf(parseMarkdown('intro\n## One\nbody **one**\n## Two\n- x'));
  assert.deepEqual(s.map((x) => x.heading), ['', 'One', 'Two']);
  assert.equal(plainText((s[1]!.blocks[0] as unknown as { v: never[] }).v), 'body one');
  assert.deepEqual(sectionsOf([]), []);
});
