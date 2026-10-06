// Tests M21 Discover helpers: the plaza's window of tiles, hidden category tiles, the category swipe, For you order.
/**
 * M21 US7 (T082, T083, T085). The plaza is OUR OWN DESIGN (owner, 2026-10-06).
 *
 * Guard "the plaza mounts about (cols + 2) × (rows + 2) tiles" — the break that turns it red:
 * drop the `- 1` / `+ 2` ring in `windowCells` (src/discover/plaza-grid.ts), or return every
 * loaded cell; the count test goes red.
 * Guard "a hidden category stays hidden and comes back" — the break: make `hideCategory` skip
 * `settings.set`; the round-trip test goes red.
 */
import { indexAt, maxScrollY, nearBottom, rowsFor, windowCells, wrap, WRAP } from '@/discover/plaza-grid';
import { HIDDEN_CATEGORIES_KEY, hideCategory, readHiddenCategories, showCategory, visibleGenres } from '@/discover/hidden-categories';
import { categoryList, neighbourGenre } from '@/discover/category-list';
import type { ShowCard } from '@/social/api';

const memory = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k), set: (k: string, v: string) => { m.set(k, v); } };
};

it('plaza: the window is the visible cells plus one ring, clamped to the loaded rows', () => {
  const view = { width: 390, height: 700 };
  const pitch = 122;
  const rows = rowsFor(600);
  const cells = windowCells(0, 0, view, pitch, rows);
  const cols = Math.ceil(view.width / pitch) + 2;
  const rws = Math.ceil(view.height / pitch) + 2;
  // At the top the row above is clamped away, so at most (cols) × (rws) and never all 600.
  expect(cells.length).toBeLessThanOrEqual(cols * rws);
  expect(cells.length).toBeGreaterThanOrEqual(cols * (rws - 1));
  expect(cells.every((c) => c.row >= 0 && c.row < rows)).toBe(true);
  // Far down and to the left, the window moves with the offset.
  const far = windowCells(-5000, 3000, view, pitch, rows);
  expect(Math.min(...far.map((c) => c.col))).toBe(Math.floor(-5000 / pitch) - 1);
  expect(Math.min(...far.map((c) => c.row))).toBe(Math.floor(3000 / pitch) - 1);
});

it('plaza: the wall repeats sideways; nothing above the top or past the loaded shows', () => {
  expect(wrap(-1, WRAP)).toBe(WRAP - 1);
  expect(indexAt({ col: 0, row: 0 }, 20)).toBe(0);
  expect(indexAt({ col: WRAP, row: 0 }, 20)).toBe(0);
  expect(indexAt({ col: -1, row: 1 }, 20)).toBe(WRAP + WRAP - 1);
  expect(indexAt({ col: 0, row: -1 }, 20)).toBeUndefined();
  expect(indexAt({ col: 5, row: 2 }, 20)).toBeUndefined();
  expect(rowsFor(17)).toBe(3);
});

it('plaza: more load near the bottom edge; the drag stops at the last row', () => {
  expect(nearBottom(0, 700, 100, 30)).toBe(false);
  expect(nearBottom(2000, 700, 100, 30)).toBe(true);
  expect(maxScrollY(3, 100, 700)).toBe(0);
  expect(maxScrollY(30, 100, 700)).toBe(2300);
});

it('a hidden category stays hidden, makes room for the next tile, and comes back', () => {
  const s = memory();
  const genres = [1, 2, 3, 4].map((id) => ({ id }));
  expect(readHiddenCategories(s)).toEqual([]);
  expect(hideCategory(s, 2)).toEqual([2]);
  expect(JSON.parse(s.get(HIDDEN_CATEGORIES_KEY)!)).toEqual([2]);
  expect(visibleGenres(genres, readHiddenCategories(s), 2).map((g) => g.id)).toEqual([1, 3]);
  expect(showCategory(s, 2)).toEqual([]);
  s.set(HIDDEN_CATEGORIES_KEY, 'not json');
  expect(readHiddenCategories(s)).toEqual([]);
});

it('category: a swipe left opens the next category, right the previous; short or past the ends does nothing', () => {
  const ids = [10, 20, 30];
  expect(neighbourGenre(ids, 20, -120)).toBe(30);
  expect(neighbourGenre(ids, 20, 120)).toBe(10);
  expect(neighbourGenre(ids, 20, 30)).toBeUndefined();
  expect(neighbourGenre(ids, 30, -120)).toBeUndefined();
  expect(neighbourGenre(ids, 10, 120)).toBeUndefined();
});

it('category For you: shows you do not follow first, chart order kept inside each group', () => {
  const show = (u: string): ShowCard => ({ feedUrl: u, title: u, author: 'a', genres: [] });
  const out = categoryList(['a', 'b', 'c', 'd'].map(show), { sort: 'forYou', notSubscribedOnly: false, subscribed: new Set(['a', 'c']) });
  expect(out.map((s) => s.feedUrl)).toEqual(['b', 'd', 'a', 'c']);
});
