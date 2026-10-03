// Tests bad picks are dropped with warnings, and the right day's picks are returned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastPickDays, picksForDay, validateIssues, validatePicks } from '../src/picks.ts';

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

test('M12: the file may be an object { picks, issues }; anything that is neither is a warning, not a throw', () => {
  assert.deepEqual(validatePicks({ picks: [good] }), { picks: [good], warnings: [] });
  assert.deepEqual(validatePicks('nope'), { picks: [], warnings: ['picks: not an array'] });
  assert.deepEqual(validatePicks(null), { picks: [], warnings: ['picks: not an array'] });
});

test('M12 FR-070: past picks, 7 days a page, newest first, before a date, never the future; next only when there is more', () => {
  const p = (date: string, why: string, order?: number) => ({ date, feedUrl: 'https://f', why, ...(order !== undefined ? { order } : {}) });
  const days = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
  const picks = [...days.map((d) => p(d, `w${d.slice(-2)}`)), p('2026-09-18', 'second', 2), p('2026-09-18', 'first', 1), p('2026-09-30', 'future')];
  const one = pastPickDays(picks, '2026-09-29', undefined);
  assert.deepEqual(one.days.map((d) => d.date), ['2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15', '2026-09-14', '2026-09-13', '2026-09-12']);
  assert.deepEqual(one.days[0]!.picks.map((x) => x.why), ['first', 'second', 'w18']);
  assert.equal(one.next, '2026-09-12');
  const two = pastPickDays(picks, '2026-09-29', one.next);
  assert.deepEqual(two, { days: [{ date: '2026-09-11', picks: [p('2026-09-11', 'w11')] }, { date: '2026-09-10', picks: [p('2026-09-10', 'w10')] }] });
  assert.deepEqual(pastPickDays([], '2026-09-29', undefined), { days: [] });
});

test('M12 FR-101: issues validate like picks — bad issues and bad items dropped with a warning naming them, items in order', () => {
  const item = (order: number, note: string, extra: Record<string, unknown> = {}) => ({ order, feedUrl: 'https://f', note, ...extra });
  const ok = { id: 'issue-1', date: '2026-09-22', title: ' First ', intro: ' Why. ', items: [item(2, 'b', { guid: 'g2' }), item(1, ' a ', { guid: '' }), item(1.5, 'x'), 'nope', item(3, 'c', { feedUrl: 'ftp://x' }), item(4, '')] };
  const r = validateIssues({ picks: [], issues: [
    ok,
    'nope',
    { ...ok, id: 'Bad Id' },
    { ...ok },
    { ...ok, id: 'd', date: '22/09' },
    { ...ok, id: 't', title: 'x'.repeat(81) },
    { ...ok, id: 'i', intro: 3 },
    { ...ok, id: 'n', items: 'x' },
  ] });
  assert.deepEqual(r.issues, [{ id: 'issue-1', date: '2026-09-22', title: 'First', intro: 'Why.', items: [{ order: 1, feedUrl: 'https://f', note: 'a' }, { order: 2, feedUrl: 'https://f', guid: 'g2', note: 'b' }] }]);
  assert.deepEqual(r.warnings, [
    'issues[0].items[2]: order must be an integer', 'issues[0].items[3]: not an object', 'issues[0].items[4]: feedUrl must be an http(s) URL', 'issues[0].items[5]: note must be 1–280 characters',
    'issues[1]: not an object', 'issues[2]: id must be 1–64 lower-case letters, digits or dashes', 'issues[3]: id is used twice',
    'issues[4]: date must be YYYY-MM-DD', 'issues[5]: title must be 1–80 characters', 'issues[6]: intro must be 1–600 characters', 'issues[7]: items must be an array',
  ]);
  assert.deepEqual(validateIssues([good]), { issues: [], warnings: [] });
  assert.deepEqual(validateIssues({ picks: [] }), { issues: [], warnings: [] });
  assert.deepEqual(validateIssues(null), { issues: [], warnings: [] });
  assert.deepEqual(validateIssues({ issues: {} }), { issues: [], warnings: ['issues: not an array'] });
});
