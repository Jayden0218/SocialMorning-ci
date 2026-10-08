// Lists draft and scheduled episodes that are not in the feed yet.
import { useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';

type Hosted = { id: string; title: string; status: 'draft' | 'published'; scheduled: boolean; publishedAt: string; coverUrl: string | null; paid?: boolean; paidAllowed?: boolean };
/** M20 US6: the show's price level for its paid episodes (1–5), or null. */
type Details = { show: { priceTier?: number | null } };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * M14 US4 — episodes not in the feed yet: drafts, and scheduled ones with their time. Hidden when there are none.
 * M20 US6 (FR-024): an episode can be made paid here, before it is published — never after, and never one
 * from before paid episodes existed. The show's price level (one of five Google Play prices) is set here too.
 * Listeners buy on Android only, once the owner has a Google Play account; until then nothing is sold.
 */
export function Pending({ show, onChange }: { show: Show; onChange: () => void }) {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<{ items: Hosted[] }>(`/v1/studio/shows/${show.key}/hosted-episodes`), [show.key, n]);
  const details = useLoad(() => api<Details>(`/v1/studio/shows/${show.key}/details`), [show.key, n]);
  const tier = details.state === 'ready' ? details.data.show.priceTier ?? null : null;
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
      <label className="field" style={{ marginBottom: 12 }}>
        <span>Price for paid episodes</span>
        <select value={tier ?? ''} disabled={busy || details.state !== 'ready'}
          onChange={(ev) => { const v = ev.target.value === '' ? null : Number(ev.target.value); void run(() => api(`/v1/studio/shows/${show.key}/price`, { method: 'PUT', body: { tier: v } })); }}>
          <option value="">No paid episodes</option>
          {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>Price level {t}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 13 }}>One purchase opens every paid episode of this show. Sold through Google Play on Android only, once SocialNet's Play account is open.</span>
      </label>
      <ul className="rows">
        {pending.map((e) => (
          <li key={e.id}>
            {e.coverUrl ? <img src={e.coverUrl} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} /> : null}
            <div className="row-main">
              <div className="row-title">{e.title}</div>
              <div className="row-sub">{e.status === 'draft' ? 'Draft' : `Scheduled for ${when(e.publishedAt)}`}{e.paid ? <span className="pill" style={{ marginLeft: 8 }}>Paid</span> : null}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {e.paidAllowed && (tier !== null || e.paid) ? (
                <button type="button" className="btn btn-quiet" disabled={busy} aria-label={`${e.paid ? 'Make free' : 'Make paid'}: ${e.title}`}
                  onClick={() => { void run(() => api(`/v1/studio/shows/${show.key}/hosted-episodes/${e.id}/paid`, { method: 'PUT', body: { paid: !e.paid } })); }}>
                  {e.paid ? 'Make free' : 'Make paid'}
                </button>
              ) : null}
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
