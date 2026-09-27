/**
 * The legal texts' Markdown → blocks. The break that turns the first test red: make
 * `spans` in `src/legal/markdown.ts` ignore `**` (every span comes back not bold).
 */
import { parseLegal, spans, titleOf } from '../src/legal/markdown';
import { LEGAL_TEXT } from '../src/legal/texts';

it('bold is split out of a line', () => {
  expect(spans('a **b** c')).toEqual([{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }]);
  expect(spans('`[DATE]`')).toEqual([{ text: '[DATE]', bold: false }]);
});

it('headings, items, notes and tables each become their own block', () => {
  const md = '# T\n\n## H\n\n### S\n\npara\n\n- item\n\n> note\n\n| A | B |\n|---|---|\n| 1 | 2 |\n| | |\n';
  expect(parseLegal(md).map((b) => b.kind)).toEqual(['title', 'heading', 'subheading', 'paragraph', 'item', 'note', 'row', 'row']);
  const rows = parseLegal(md).filter((b) => b.kind === 'row');
  expect(rows[0].spans).toEqual([{ text: 'A · B', bold: true }]);
  expect(rows[1].spans).toEqual([{ text: '1 · 2', bold: false }]);
});

it('each document has its own title and no raw Markdown left in the blocks', () => {
  expect(titleOf(LEGAL_TEXT.agreement)).toBe('SocialNet Software Licence and Service Agreement');
  expect(titleOf(LEGAL_TEXT.privacy)).toBe('SocialNet Privacy Policy');
  expect(titleOf(LEGAL_TEXT.community)).toBe('SocialNet Community Guidelines');
  for (const text of Object.values(LEGAL_TEXT)) {
    for (const b of parseLegal(text)) for (const s of b.spans) expect(s.text).not.toMatch(/\*\*|^#|^\|/);
  }
});
