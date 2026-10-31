// The few sizes, a grid helper and the props the Discover section files share.
/**
 * M31 T025 (review D7): the shared bits of what was `sections.tsx` — one tap size, the section action
 * props (`Act`) and `gridRows`, which cuts a list into rows of equal cells (the last row padded with
 * `null` so every cell keeps one width; the iPhone's "elements run away the layout", 2026-10-07).
 */
import { hit } from '@/design';
import type { EpisodeCard } from '@/social/api';
import type { RowStats } from './parts';

export const TAP = { minHeight: hit.min };
export const SQUARE = { minHeight: hit.min, minWidth: hit.min };
export const CELL = { flex: 1 };


/** Items cut into rows of `cols`; the last row is padded with `null` cells so every cell keeps one width. */
export function gridRows<T>(items: readonly T[], cols: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    const row: (T | null)[] = items.slice(i, i + cols);
    while (row.length < cols) row.push(null);
    rows.push(row);
  }
  return rows;
}

export type Act = { onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void; stats?: Readonly<Record<string, RowStats>> };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Owner, 2026-10-04: "2026-10-02" reads "Oct 2" — the month and day, no year. Anything else is shown as it came. */
export function shortDate(date: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(date);
  const month = m ? MONTHS[Number(m[1]) - 1] : undefined;
  return m && month ? `${month} ${Number(m[2])}` : date;
}

/**
 * M31 T030 (design-pulse2 `home--hidden-undo`): where a card the listener just turned down sat in the For You
 * deck, so its Hidden card keeps the slot — the first row the choice removes (that episode; for a show, its first
 * row), or 0 when it is not there.
 */
export function hiddenAt(rows: readonly { card: EpisodeCard }[], kind: 'episode' | 'show', card: EpisodeCard): number {
  return Math.max(0, rows.findIndex((r) => (kind === 'episode' ? r.card.id === card.id : r.card.feedUrl === card.feedUrl)));
}
