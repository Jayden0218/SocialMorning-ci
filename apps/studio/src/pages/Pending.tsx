// Lists draft and scheduled episodes that are not in the feed yet.
import { useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';

type Hosted = { id: string; title: string; status: 'draft' | 'published'; scheduled: boolean; publishedAt: string; coverUrl: string | null };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** M14 US4 — episodes not in the feed yet: drafts, and scheduled ones with their time. Hidden when there are none. */
export function Pending({ show, onChange }: { show: Show; onChange: () => void }) {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<{ items: Hosted[] }>(`/v1/studio/shows/${show.key}/hosted-episodes`), [show.key, n]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [del, setDel] = useState<Hosted | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); setN((x) => x + 1); onChange(); } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  if (list.state === 'loading') return <Loading lines={2} label="Drafts" />;
  if (list.state === 'error') return <div className="card" style={{ marginBottom: 16 }}><Failed message={list.message} retry={list.retry} /></div>;
  const pending = list.data.items.filter((e) => e.status === 'draft' || e.scheduled);
  if (pending.length === 0) return null;
  return (
    <section className="card" aria-labelledby="pd-h" style={{ marginBottom: 16 }}>
      <h2 id="pd-h">Drafts and scheduled</h2>
      <p className="muted" style={{ marginTop: 0 }}>Not in your feed yet. Listeners cannot see these.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <ul className="rows">
        {pending.map((e) => (
          <li key={e.id}>
            {e.coverUrl ? <img src={e.coverUrl} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} /> : null}
            <div className="row-main">
              <div className="row-title">{e.title}</div>
              <div className="row-sub">{e.status === 'draft' ? 'Draft' : `Scheduled for ${when(e.publishedAt)}`}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button type="button" className="btn btn-quiet" disabled={busy} aria-label={`Publish now: ${e.title}`}
                onClick={() => { void run(() => api(`/v1/studio/shows/${show.key}/hosted-episodes/${e.id}`, { method: 'PUT', body: { status: 'published', publishAt: null } })); }}>
                Publish now
              </button>
              <button type="button" className="linkish" disabled={busy} onClick={() => setDel(e)}>Delete<span className="sr-only"> {e.title}</span></button>
            </div>
          </li>
        ))}
      </ul>
      {del ? (
        <ConfirmDialog title={`Delete ${del.title}?`} body="The episode and its audio are removed for good." confirm="Delete" busy={busy}
          onCancel={() => setDel(null)} onConfirm={() => { const e = del; setDel(null); void run(() => api(`/v1/studio/shows/${show.key}/hosted-episodes/${e.id}`, { method: 'DELETE' })); }} />
      ) : null}
    </section>
  );
}
