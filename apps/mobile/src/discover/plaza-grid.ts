// The plaza's grid sums: which tiles to mount for a pan offset, which show sits in a cell, when to load more.
/**
 * M21 US7 (T083). The new-shows plaza is OUR OWN DESIGN (owner, 2026-10-06): a wall of covers
 * dragged in any direction. The wall is `WRAP` columns wide and repeats sideways for ever; it is
 * as tall as the loaded shows (`rows`), and more load when the view nears the bottom edge. Only
 * about (cols + 2) × (rows + 2) tiles are mounted at once — the visible ones plus one ring.
 * Kept apart from the screen so the sums are tested without rendering.
 */

/** Columns in one turn of the wall; the wall repeats sideways after this many. */
export const WRAP = 8;
/** Rows from the bottom of what is loaded at which the next page is asked for. */
export const LOAD_AHEAD_ROWS = 3;

export type Cell = { col: number; row: number };

/** A whole-number modulo that is never negative: wrap(-1, 8) = 7. */
export const wrap = (n: number, m: number): number => ((n % m) + m) % m;

/** The rows the loaded shows fill. */
export const rowsFor = (count: number): number => Math.ceil(count / WRAP);

/** The show index in a cell, or undefined above the wall, below what is loaded, or past the end. */
export function indexAt(cell: Cell, count: number): number | undefined {
  if (cell.row < 0) return undefined;
  const i = cell.row * WRAP + wrap(cell.col, WRAP);
  return i < count ? i : undefined;
}

/**
 * The cells to mount for a top-left content offset (`x`, `y` ≥ 0 means scrolled right and down),
 * a viewport and a tile pitch: the visible cells plus one ring, rows clamped to the wall.
 */
export function windowCells(x: number, y: number, view: { width: number; height: number }, pitch: number, rows: number): Cell[] {
  const c0 = Math.floor(x / pitch) - 1;
  const r0 = Math.max(0, Math.floor(y / pitch) - 1);
  const cols = Math.ceil(view.width / pitch) + 2;
  const rws = Math.ceil(view.height / pitch) + 2;
  const out: Cell[] = [];
  for (let row = r0; row < Math.min(rows, r0 + rws); row++) {
    for (let col = c0; col < c0 + cols; col++) out.push({ col, row });
  }
  return out;
}

/** True when the bottom of the view is within LOAD_AHEAD_ROWS of the last loaded row. */
export function nearBottom(y: number, viewHeight: number, pitch: number, rows: number): boolean {
  return Math.ceil((y + viewHeight) / pitch) >= rows - LOAD_AHEAD_ROWS;
}

/** How far down the wall may be dragged: never past its last row (0 when it fits the view). */
export const maxScrollY = (rows: number, pitch: number, viewHeight: number): number => Math.max(0, rows * pitch - viewHeight);
