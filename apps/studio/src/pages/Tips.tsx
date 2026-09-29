import { api, type Show } from '../api';
import { shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { StatCard } from '../shell/StatCard';
import { Empty, Failed, Loading } from '../shell/States';
import { Table, type Column } from '../shell/Table';
import { useLoad } from '../useLoad';

type T = { totalMicrosByCurrency: Record<string, number>; items: { at: string; amountMicros: number | null; currency: string | null; from: { displayName: string } | null }[] };
const money = (micros: number | null, cur: string | null) =>
  micros === null || !cur ? '—' : new Intl.NumberFormat('en', { style: 'currency', currency: cur }).format(micros / 1_000_000);

/** US7 — tips received, view only (FR-027). Tips are App Store / Google Play purchases verified by the server. */
export function Tips({ show }: { show: Show }) {
  const t = useLoad(() => api<T>(`/v1/studio/shows/${show.key}/tips`), [show.key]);
  const cols: Column<T['items'][number]>[] = [
    { key: 'at', label: 'Date', render: (r) => shortDate(r.at) },
    { key: 'from', label: 'From', render: (r) => r.from?.displayName ?? 'Anonymous' },
    { key: 'amt', label: 'Amount', numeric: true, render: (r) => money(r.amountMicros, r.currency) },
  ];
  return (
    <>
      <PageHead title="Tips" sub="Payouts are not available yet. Refunded tips are not counted." />
      {t.state === 'loading' ? <Loading /> : null}
      {t.state === 'error' ? <div className="card"><Failed message={t.message} retry={t.retry} /></div> : null}
      {t.state === 'ready' ? (
        <>
          <section className="stats" aria-label="Totals">
            {Object.keys(t.data.totalMicrosByCurrency).length === 0
              ? <StatCard label="Total received" value="0" />
              : Object.entries(t.data.totalMicrosByCurrency).map(([cur, m]) => <StatCard key={cur} label={`Total received (${cur})`} value={money(m, cur)} />)}
          </section>
          <section className="card">
            {t.data.items.length === 0 ? <Empty title="No tips yet">When listeners tip in the app, each one appears here.</Empty> : <Table caption="Tips" columns={cols} rows={t.data.items} rowKey={(r) => r.at + (r.from?.displayName ?? '')} />}
          </section>
        </>
      ) : null}
    </>
  );
}
