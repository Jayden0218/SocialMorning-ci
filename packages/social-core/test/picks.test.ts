import { test } from 'node:test';
import assert from 'node:assert/strict';
import { picksForDay, validatePicks } from '../src/picks.ts';

const good = { date: '2026-09-22', feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', why: 'Because.', order: 1 };

test('A1: one good entry among bad ones → one pick, a warning per bad entry, no throw (G1)', () => {
  const { picks, warnings } = validatePicks([
    good,
    { feedUrl: 'https://f', why: 'no date' },
    { date: '2026-09-22', feedUrl: 'https://f', why: 'x'.repeat(141) },
    { date: '2026-09-22', feedUrl: 'ftp://f', why: 'bad url' },
    { date: '2026-09-22', feedUrl: 'https://f', why: 'order', order: 1.5 },
    'not an object',
    { date: '22/09/2026', feedUrl: 'https://f', why: 'bad date' },
    { date: '2026-09-22', feedUrl: 'https://f', why: '   ' },
    { date: '2026-09-22', feedUrl: 'https://f', why: ' show pick ', guid: '' },
  ]);
  assert.deepEqual(picks, [good, { date: '2026-09-22', feedUrl: 'https://f', why: 'show pick' }]);
  assert.equal(warnings.length, 7);
  assert.match(warnings[0]!, /picks\[1\]: date/);
  assert.match(warnings[1]!, /picks\[2\]: why/);
  assert.match(warnings[2]!, /picks\[3\]: feedUrl/);
  assert.match(warnings[3]!, /picks\[4\]: order/);
  assert.match(warnings[4]!, /picks\[5\]: not an object/);
  assert.deepEqual(validatePicks({ not: 'an array' }), { picks: [], warnings: ['picks: not an array'] });
});

test('A2: today\'s picks; else the most recent past day\'s, dated; at most 5 by order then file order; future days ignored', () => {
  const p = (date: string, why: string, order?: number) => ({ date, feedUrl: 'https://f', why, ...(order !== undefined ? { order } : {}) });
  const picks = [p('2026-09-21', 'y1'), p('2026-09-22', 't3', 3), p('2026-09-22', 't1', 1), p('2026-09-22', 'tA'), p('2026-09-22', 'tB'), p('2026-09-22', 't2', 2), p('2026-09-22', 'tC'), p('2026-09-23', 'tomorrow')];
  const today = picksForDay(picks, '2026-09-22');
  assert.equal(today.date, '2026-09-22');
  assert.deepEqual(today.picks.map((x) => x.why), ['t1', 't2', 't3', 'tA', 'tB']);
  assert.deepEqual(picksForDay(picks, '2026-09-21'), { date: '2026-09-21', picks: [p('2026-09-21', 'y1')] });
  assert.deepEqual(picksForDay(picks, '2026-09-20'), { picks: [] });
  assert.deepEqual(picksForDay([], '2026-09-22'), { picks: [] });
});
