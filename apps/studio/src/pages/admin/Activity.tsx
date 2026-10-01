import { useState } from 'react';
import { api } from '../../api';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { errorText } from './common';

type Row = {
  id: string; at: string; adminName: string | null; actingAsName: string | null; actingAs: string | null;
  area: string; action: string; target: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; device: string | null;
};
type Page = { items: Row[]; next?: string };

const AREAS = ['picks', 'issues', 'collections', 'discover', 'launch', 'accounts', 'users', 'reports'];
const when = (iso: string) => new Date(iso).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const show = (v: unknown) => (v === undefined ? '—' : JSON.stringify(v));

/** The keys whose value changed — the diff the owner reads first. */
export function changedKeys(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])).sort();
}

/** M15 T009 (FR-005): every admin change, newest first, by area — read-only, as the record is. */
export function Activity() {
  const [area, setArea] = useState('');
  const first = useLoad(() => api<Page>(`/v1/admin/audit${area ? `?area=${area}` : ''}`), [area]);
  const [more, setMore] = useState<{ area: string; rows: Row[]; next?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const extra = more && more.area === area ? more : null;
  const rows = first.state === 'ready' ? [...first.data.items, ...(extra?.rows ?? [])] : [];
  const next = extra ? extra.next : first.state === 'ready' ? first.data.next : undefined;
  const loadMore = async () => {
    if (!next) return;
    setBusy(true); setError(null);
    try {
      const p = await api<Page>(`/v1/admin/audit?before=${next}${area ? `&area=${area}` : ''}`);
      setMore({ area, rows: [...(extra?.rows ?? []), ...p.items], ...(p.next ? { next: p.next } : {}) });
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title="Activity" sub="Every change made in Admin: who, as whom, what it was before and after. Nobody can edit this list." />
      <div className="toolbar">
        <label htmlFor="act-area">Area</label>
        <select id="act-area" className="select" value={area} onChange={(e) => { setArea(e.target.value); setMore(null); }}>
          <option value="">All areas</option>
          {AREAS.map((a) => <option key={a} value={a}>{a[0]!.toUpperCase() + a.slice(1)}</option>)}
        </select>
      </div>
      <section className="card" aria-label="Changes">
        {first.state === 'loading' ? <Loading /> : null}
        {first.state === 'error' ? <Failed message={first.message} retry={first.retry} /> : null}
        {first.state === 'ready' && rows.length === 0 ? <Empty title="Nothing recorded yet" /> : null}
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Admin changes, newest first</caption>
              <thead><tr><th scope="col">Time</th><th scope="col">Area</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">By</th><th scope="col">Change</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const keys = changedKeys(r.before, r.after);
                  return (
                    <tr key={r.id}>
                      <td className="num">{when(r.at)}</td>
                      <td>{r.area}</td>
                      <td>{r.action}</td>
                      <td className="row-body">{r.target}</td>
                      <td>{r.adminName ?? 'a deleted account'}{r.actingAs ? <> <span className="pill">as {r.actingAsName ?? r.actingAs}</span></> : null}</td>
                      <td>
                        <details>
                          <summary>{keys.length === 0 ? 'No field changed' : `${keys.length} field${keys.length === 1 ? '' : 's'}`}</summary>
                          <dl className="diff">
                            {keys.map((k) => (
                              <div key={k}>
                                <dt>{k}</dt>
                                <dd><span className="muted">before</span> <code>{show(r.before?.[k])}</code></dd>
                                <dd><span className="muted">after</span> <code>{show(r.after?.[k])}</code></dd>
                              </div>
                            ))}
                          </dl>
                          {r.device ? <p className="muted">Device: {r.device}</p> : null}
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
        {next ? <div className="pager"><button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void loadMore(); }}>{busy ? 'Loading…' : 'Load more'}</button></div> : null}
      </section>
    </>
  );
}
