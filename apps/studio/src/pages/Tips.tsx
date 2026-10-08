// Page showing tips received, with a switch to allow or stop tips.
import { useEffect, useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { money, shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { StatCard } from '../shell/StatCard';
import { Empty, Failed, Loading } from '../shell/States';
import { Table, type Column } from '../shell/Table';
import { useLoad } from '../useLoad';

type T = { totalMicrosByCurrency: Record<string, number>; items: { at: string; amountMicros: number | null; currency: string | null; from: { displayName: string } | null }[] };

/**
 * M14 US7 (FR-08) — whether listeners may tip this show at all. Saved at once (a switch, not a form).
 * Tips are App Store / Google Play purchases verified by the server (constitution 2.1.0).
 */
function TipsSwitch({ show }: { show: Show }) {
  const o = useLoad(() => api<{ overrides: { tipsEnabled: boolean } | null }>(`/v1/studio/shows/${show.key}/overrides`), [show.key]);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (o.state === 'ready') setOn(o.data.overrides?.tipsEnabled ?? false); }, [o.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = async (next: boolean) => {
    setBusy(true); setMsg(null); setOn(next);
    try {
      await api(`/v1/studio/shows/${show.key}/overrides`, { method: 'PUT', body: { tipsEnabled: next } });
      setMsg({ ok: true, text: next ? 'Saved: tips are on.' : 'Saved: tips are off.' });
    } catch (e) { setOn(!next); setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="tsw-h" style={{ marginBottom: 16 }}>
      <h2 id="tsw-h">Accept tips</h2>
      {o.state === 'loading' || on === null ? (o.state === 'error' ? <Failed message={o.message} retry={o.retry} /> : <Loading lines={1} label="Tips setting" />) : (
        <label className="switch">
          <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={(e) => { void flip(e.target.checked); }} />
          {on ? 'On' : 'Off'}
        </label>
      )}
      {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      <ul className="muted" style={{ fontSize: 13, paddingLeft: 18, marginBottom: 0 }}>
        <li>Listeners tip in the app, through the App Store or Google Play. The store keeps its fee.</li>
        <li>Every tip is checked by our server before it counts. A refunded tip is removed.</li>
        <li>Listening stays free. Tips never unlock episodes or comments.</li>
        <li>Listeners on Android see a Tip the host button on your show page while this is on.</li>
        <li>Payouts are not available yet.</li>
      </ul>
    </section>
  );
}

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
      <TipsSwitch show={show} />
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
