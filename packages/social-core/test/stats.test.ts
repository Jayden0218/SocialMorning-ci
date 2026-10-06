// Tests 7-day and all-time listening totals and the top shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossingDay, daySeries, listening, monthSeries, stats, type ListenedRow } from '../src/stats.ts';

const row = (day: string, unionMs: number, extra: Partial<ListenedRow> = {}): ListenedRow => ({ episodeId: 'e' + day, day, unionMs, finished: false, ...extra });

test('A4: last 7 days includes today−6 and excludes day 8; totals are episode time', () => {
  const rows = [
    row('2026-09-21', 600_000, { feedUrl: 'A', showTitle: 'Show A' }),
    row('2026-09-15', 300_000, { feedUrl: 'A', showTitle: 'Show A', finished: true }),   // today−6: inside
    row('2026-09-14', 100_000, { feedUrl: 'B', finished: true }),                         // today−7: outside last7
    row('2026-09-01', 50_000),                                                            // no show: counted, not ranked
  ];
  const s = stats(rows, '2026-09-21');
  assert.equal(s.last7.listenedMs, 900_000);
  assert.equal(s.last7.finished, 1);
  assert.deepEqual(s.last7.topShows, [{ feedUrl: 'A', showTitle: 'Show A', listenedMs: 900_000 }]);
  assert.equal(s.all.listenedMs, 1_050_000);
  assert.equal(s.all.finished, 2);
  assert.deepEqual(s.all.topShows.map((t) => t.feedUrl), ['A', 'B']);
  assert.equal('showTitle' in s.all.topShows[1]!, false);
});

test('A4: a finished episode counts once across days; topN and ties by feedUrl', () => {
  const rows = [
    { episodeId: 'x', feedUrl: 'Z', day: '2026-09-20', unionMs: 10, finished: true },
    { episodeId: 'x', feedUrl: 'Z', day: '2026-09-21', unionMs: 10, finished: true },
    { episodeId: 'y', feedUrl: 'Y', day: '2026-09-21', unionMs: 20, finished: false },
    { episodeId: 'w', feedUrl: 'W', day: '2026-09-21', unionMs: 20, finished: false },
  ];
  const s = stats(rows, '2026-09-21', 2);
  assert.equal(s.all.finished, 1);
  assert.deepEqual(s.all.topShows.map((t) => t.feedUrl), ['W', 'Y']);
});

// ---- M21 US9: minutes per day and per month (GET /v1/me/listening) ----
const M = 60_000;

test('US9: the 30-day series is 30 points ending today, oldest first, 0-filled; yesterday is the minutes listened yesterday', () => {
  const rows = [
    row('2026-10-05', 30 * M, { episodeId: 'a' }),
    row('2026-10-05', 15 * M + 20_000, { episodeId: 'b' }), // two episodes the same day add up
    row('2026-09-06', 5 * M),                                 // today−30: outside the 30 days
  ];
  const s = daySeries(rows, '2026-10-06');
  assert.equal(s.length, 30);
  assert.deepEqual(s[0], { day: '2026-09-07', minutes: 0 });
  assert.deepEqual(s[29], { day: '2026-10-06', minutes: 0 });
  assert.deepEqual(s[28], { day: '2026-10-05', minutes: 45 });
  assert.deepEqual(daySeries(rows, '2026-10-06', 31)[0], { day: '2026-09-06', minutes: 5 });
  assert.equal(daySeries([], '2026-03-01', 2)[0]!.day, '2026-02-28');
});

test('US9: the month series runs from the first month with listening to this month, across a new year', () => {
  assert.deepEqual(monthSeries([], '2026-10-06'), []);
  const rows = [row('2025-11-20', 60 * M), row('2026-01-02', 30 * M), row('2026-01-30', 30 * M)];
  assert.deepEqual(monthSeries(rows, '2026-02-10'), [
    { day: '2025-11', minutes: 60 }, { day: '2025-12', minutes: 0 }, { day: '2026-01', minutes: 60 }, { day: '2026-02', minutes: 0 },
  ]);
  // A row dated after today (a phone's clock ahead) still gets its month.
  assert.deepEqual(monthSeries([row('2026-03-01', M)], '2026-02-28').map((p) => p.day), ['2026-02', '2026-03']);
});

test('US9: listening() — the range total is rounded once; top shows of the range are named by title or feed URL', () => {
  const rows = [
    row('2026-10-06', 20_000, { episodeId: 'x', feedUrl: 'A', showTitle: 'Show A' }),
    row('2026-10-06', 20_000, { episodeId: 'y', feedUrl: 'A', showTitle: 'Show A' }),
    row('2026-10-01', 2 * M, { feedUrl: 'B' }),
    row('2026-01-01', 600 * M, { feedUrl: 'C', showTitle: 'Old' }),
    row('2026-10-09', 7 * M, { feedUrl: 'D' }), // after today: not in the 30 days
  ];
  const d = listening(rows, '2026-10-06', '30d');
  assert.equal(d.days.length, 30);
  assert.equal(d.totalMinutes, 3); // 40 s + 2 min = 2.67 min → 3
  assert.deepEqual(d.topShows, [{ feedUrl: 'B', title: 'B', minutes: 2 }, { feedUrl: 'A', title: 'Show A', minutes: 1 }]);
  const a = listening(rows, '2026-10-06', 'all', 1);
  assert.equal(a.days[0]!.day, '2026-01');
  assert.equal(a.days[a.days.length - 1]!.day, '2026-10');
  assert.equal(a.totalMinutes, 610);
  assert.deepEqual(a.topShows, [{ feedUrl: 'C', title: 'Old', minutes: 600 }]);
  assert.deepEqual(listening([], '2026-10-06', 'all'), { days: [], totalMinutes: 0, topShows: [] });
});

test('US9: crossingDay is the first day the running total reaches the threshold', () => {
  const rows = [row('2026-09-02', 40 * M), row('2026-09-01', 30 * M)];
  assert.equal(crossingDay(rows, 60 * M), '2026-09-02');
  assert.equal(crossingDay(rows, 30 * M), '2026-09-01');
  assert.equal(crossingDay(rows, 71 * M), undefined);
});
