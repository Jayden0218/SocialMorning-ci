// A data table with keyboard-friendly sortable headers and page buttons.
import type { ReactNode } from 'react';

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; numeric?: boolean; sortable?: boolean };

/** Sortable headers are buttons (keyboard-reachable), and aria-sort says which way (FR-029). */
export function Table<T>({ caption, columns, rows, rowKey, sort, dir, onSort }: {
  caption: string; columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string;
  sort?: string; dir?: 'asc' | 'desc'; onSort?: (key: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? 'num-col' : undefined}
                aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sortable && onSort ? (
                  <button type="button" className="th-btn" onClick={() => onSort(c.key)}>
                    {c.label}<span aria-hidden="true">{sort === c.key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
                  </button>
                ) : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => <td key={c.key} className={c.numeric ? 'num-col num' : undefined}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="btn btn-quiet" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="muted num">Page {page} of {pages}</span>
      <button type="button" className="btn btn-quiet" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
