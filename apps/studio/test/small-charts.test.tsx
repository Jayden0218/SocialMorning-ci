// Checks the two small charts give a screen reader the same numbers the picture shows.
/**
 * The charts are drawn aria-hidden; each carries a visually hidden table with the same data. jsdom has no layout, so the
 * picture itself cannot be measured here — the table is what is asserted.
 *
 * The break that turns it red: change `d.sub` to `d.unsub` in the SubTrend table row in src/charts/Small.tsx.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { HourBars, SubTrend } from '../src/charts/Small';

afterEach(cleanup);

describe('small charts', () => {
  it('SubTrend lists each day with its subscribes and unsubscribes', () => {
    render(<SubTrend points={[{ date: '2026-10-01', sub: 3, unsub: 1 }, { date: '2026-10-02', sub: 0, unsub: 2 }]} />);
    const table = screen.getByRole('table', { name: 'Subscribes and unsubscribes per day', hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true }).slice(1).map((r) => within(r).getAllByRole('cell', { hidden: true }).map((c) => c.textContent));
    expect(rows).toEqual([['2026-10-01', '3', '1'], ['2026-10-02', '0', '2']]);
  });

  it('HourBars lists all 24 hours with the listens in each', () => {
    const hours = Array.from({ length: 24 }, (_, h) => h * 2);
    render(<HourBars hours={hours} />);
    const table = screen.getByRole('table', { name: 'Listens by hour', hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(24);
    expect(within(rows[0]!).getAllByRole('cell', { hidden: true }).map((c) => c.textContent)).toEqual(['0:00', '0']);
    expect(within(rows[23]!).getAllByRole('cell', { hidden: true }).map((c) => c.textContent)).toEqual(['23:00', '46']);
  });
});
