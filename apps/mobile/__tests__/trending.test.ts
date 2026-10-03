/**
 * The search box's trending line (owner, 2026-09-27). The break that turns the first test
 * red: drop the `!out.includes(name)` check in `src/discover/trending.ts`.
 */
import type { ChartTab } from '@/discover/sections';
import { hintAt, trendingHints } from '@/discover/trending';

const card = (showTitle: string) => ({ showTitle }) as ChartTab['rows'][number];

it('show names from the Top chart first, each once, then Talked about; at most five', () => {
  const chart: ChartTab[] = [
    { key: 'talked', label: 'Talked about', rows: [card('D'), card('A'), card('E'), card('F')] },
    { key: 'top', label: 'Top', rows: [card('A'), card('B'), card('A'), card(' C ')] },
  ];
  expect(trendingHints(chart)).toEqual(['A', 'B', 'C', 'D', 'E']);
});

it('no chart, no hint; the ticks cycle through the names', () => {
  expect(trendingHints([])).toEqual([]);
  expect(hintAt([], 3)).toBeUndefined();
  expect([0, 1, 2, 3].map((n) => hintAt(['A', 'B', 'C'], n))).toEqual(['A', 'B', 'C', 'A']);
});
