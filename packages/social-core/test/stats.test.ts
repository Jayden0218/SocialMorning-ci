import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stats, type ListenedRow } from '../src/stats.ts';

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
