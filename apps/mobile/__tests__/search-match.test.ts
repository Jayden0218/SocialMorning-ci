// Tests splitting a name so the searched words can be drawn highlighted.
/**
 * Owner, 2026-10-01: the matching part of a search name is drawn in the accent colour.
 * The break that turns this red: in `src/search/match.ts` drop the `i` from the RegExp
 * flags (the case test), or stop escaping the term (the "C++" test).
 */
import { splitMatch } from '@/search/match';

it('splits every occurrence, any case, keeping the name as written', () => {
  expect(splitMatch('History of Rome: history', 'HISTORY')).toEqual([
    { text: 'History', match: true },
    { text: ' of Rome: ', match: false },
    { text: 'history', match: true },
  ]);
  expect(splitMatch('The Daily', 'dai')).toEqual([
    { text: 'The ', match: false },
    { text: 'Dai', match: true },
    { text: 'ly', match: false },
  ]);
});

it('no match, a blank term, an empty name; the term is text, not a pattern', () => {
  expect(splitMatch('Radiolab', 'xyz')).toEqual([{ text: 'Radiolab', match: false }]);
  expect(splitMatch('Radiolab', '  ')).toEqual([{ text: 'Radiolab', match: false }]);
  expect(splitMatch('', 'a')).toEqual([]);
  expect(splitMatch('Learn C++ fast', ' c++ ')).toEqual([
    { text: 'Learn ', match: false },
    { text: 'C++', match: true },
    { text: ' fast', match: false },
  ]);
  expect(splitMatch('a.b', '.')).toEqual([{ text: 'a', match: false }, { text: '.', match: true }, { text: 'b', match: false }]);
});

it('joining the pieces gives the name back', () => {
  for (const [name, term] of [['播客 Podcast 播客', '播客'], ['aaaa', 'aa'], ['Mixed CASE case', 'case']] as const) {
    expect(splitMatch(name, term).map((s) => s.text).join('')).toBe(name);
  }
});
