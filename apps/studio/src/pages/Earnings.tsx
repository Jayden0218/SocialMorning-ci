// Page showing the show's earnings by month — paid shows, gifts, tips and refunds — with a CSV export.
import { useState } from 'react';
import { api, downloadCsv, HttpError, type Show } from '../api';
import { money, num, shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { Table, type Column } from '../shell/Table';
import { useLoad } from '../useLoad';

type Kind = 'sale' | 'gift' | 'tip';
export type Bucket = { count: number; refunded: number; totalMicrosByCurrency: Record<string, number>; refundedMicrosByCurrency: Record<string, number> };
export type EarningsData = {
  months: { month: string; sale: Bucket; gift: Bucket; tip: Bucket }[];
  items: { at: string; kind: Kind; amountMicros: number | null; currency: string | null; refunded: boolean }[];
};

const KIND: Record<Kind, string> = { sale: 'Paid show', gift: 'Gift', tip: 'Tip' };

/** "2026-10" → "Oct 2026" (read as UTC, so no time zone moves it to another month). */
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Each currency's sum, joined: "MYR 14.70 · USD 2.99". */
const sums = (by: Record<string, number>) => Object.entries(by).filter(([, m]) => m !== 0).map(([cur, m]) => money(m, cur)).join(' · ');

function Cell({ count, by }: { count: number; by: Record<string, number> }) {
  const s = sums(by);
  return <>{num(count)}{s ? <span className="muted"> · {s}</span> : null}</>;
}

/** Refunds across the three kinds, money added up per currency. */
function refunds(r: EarningsData['months'][number]) {
  const by: Record<string, number> = {};
  for (const b of [r.sale, r.gift, r.tip]) for (const [cur, m] of Object.entries(b.refundedMicrosByCurrency)) by[cur] = (by[cur] ?? 0) + m;
  return { count: r.sale.refunded + r.gift.refunded + r.tip.refunded, by };
}

/** M24 US9 — what the store reported for this show, by month. Owner only, like Tips. */
export function Earnings({ show }: { show: Show }) {
  const e = useLoad(() => api<EarningsData>(`/v1/studio/shows/${show.key}/earnings`), [show.key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (show.role !== 'owner') {
    return <><PageHead title="Earnings" /><div className="card"><Empty title="Only the owner can do this">Ask the show's owner.</Empty></div></>;
  }
  const exportCsv = async () => {
    setBusy(true); setError(null);
    try { await downloadCsv(`/v1/studio/shows/${show.key}/export/earnings.csv`, `earnings-${show.key}.csv`); }
    catch (x) { setError(x instanceof HttpError ? x.message : 'The export did not work. Try again.'); } finally { setBusy(false); }
  };
  const monthCols: Column<EarningsData['months'][number]>[] = [
    { key: 'month', label: 'Month', render: (r) => monthName(r.month) },
    { key: 'sale', label: 'Paid shows', render: (r) => <Cell count={r.sale.count} by={r.sale.totalMicrosByCurrency} /> },
    { key: 'gift', label: 'Gifts', render: (r) => <Cell count={r.gift.count} by={r.gift.totalMicrosByCurrency} /> },
    { key: 'tip', label: 'Tips', render: (r) => <Cell count={r.tip.count} by={r.tip.totalMicrosByCurrency} /> },
    { key: 'refunded', label: 'Refunded', render: (r) => { const x = refunds(r); return <Cell count={x.count} by={x.by} />; } },
  ];
  const itemCols: Column<EarningsData['items'][number] & { i: number }>[] = [
    { key: 'at', label: 'Date', render: (r) => shortDate(r.at) },
    { key: 'kind', label: 'What', render: (r) => <>{KIND[r.kind]}{r.refunded ? <> <span className="pill pill-warn">Refunded</span></> : null}</> },
    { key: 'amt', label: 'Amount', numeric: true, render: (r) => money(r.amountMicros, r.currency) },
  ];
  return (
    <>
      <PageHead title="Earnings" sub="Paid shows, gifts and tips, by month."
        action={<button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void exportCsv(); }}>Export CSV</button>} />
      <p className="muted" style={{ marginTop: 0 }}>Amounts are what the store reported, before its fee. Payouts are not available yet.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {e.state === 'loading' ? <Loading lines={5} label="Earnings" /> : null}
      {e.state === 'error' ? <div className="card"><Failed message={e.message} retry={e.retry} /></div> : null}
      {e.state === 'ready' ? (
        <>
          <section className="card" aria-labelledby="em-h">
            <h2 id="em-h">By month</h2>
            {e.data.months.length === 0
              ? <Empty title="No earnings yet">When a listener buys your show, sends a gift or tips, it appears here.</Empty>
              : <Table caption="Earnings by month" columns={monthCols} rows={e.data.months} rowKey={(r) => r.month} />}
          </section>
          <section className="card" style={{ marginTop: 16 }} aria-labelledby="er-h">
            <h2 id="er-h">Recent</h2>
            {e.data.items.length === 0
              ? <Empty title="Nothing yet" />
              : <Table caption="Recent earnings" columns={itemCols} rows={e.data.items.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} />}
          </section>
        </>
      ) : null}
    </>
  );
}
