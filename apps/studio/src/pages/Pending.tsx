// Lists draft and scheduled episodes that are not in the feed yet, and published paid episodes.
import { Fragment, useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { mmss } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';
import { EditEpisodeForm, PreviewEditor, type Hosted } from './HostedEdit';

/** M20 US6: the show's price level for its paid episodes (1–5), or null. */
type Details = { show: { priceTier?: number | null } };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * M14 US4 — episodes not in the feed yet: drafts, and scheduled ones with their time. Hidden when there are none.
 * M20 US6 (FR-024): an episode can be made paid here, before it is published — never after, and never one
 * from before paid episodes existed. The show's price level (one of five Google Play prices) is set here too.
 * Listeners buy on Android only, once the owner has a Google Play account; until then nothing is sold.
 * M24: each can be edited here (US14), and a paid one gets a free preview (US13, owner only) — published
 * paid episodes are listed in their own card, since they are not in the app's episode list.
 */
export function Pending({ show, onChange }: { show: Show; onChange: () => void }) {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<{ items: Hosted[] }>(`/v1/studio/shows/${show.key}/hosted-episodes`), [show.key, n]);
  const details = useLoad(() => api<Details>(`/v1/studio/shows/${show.key}/details`), [show.key, n]);
  const tier = details.state === 'ready' ? details.data.show.priceTier ?? null : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [del, setDel] = useState<Hosted | null>(null);
  const [open, setOpen] = useState<{ id: string; what: 'edit' | 'preview' } | null>(null);
  const owner = show.role === 'owner';
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); setN((x) => x + 1); onChange(); } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  const toggle = (id: string, what: 'edit' | 'preview') => setOpen((o) => (o?.id === id && o.what === what ? null : { id, what }));
  if (list.state === 'loading') return <Loading lines={2} label="Drafts" />;
  if (list.state === 'error') return <div className="card" style={{ marginBottom: 16 }}><Failed message={list.message} retry={list.retry} /></div>;
  const pending = list.data.items.filter((e) => e.status === 'draft' || e.scheduled);
  const paidLive = owner ? list.data.items.filter((e) => e.paid && e.status === 'published' && !e.scheduled) : [];
  if (pending.length === 0 && paidLive.length === 0) return null;
  const opened = (e: Hosted) => (open?.id === e.id ? (
    <li style={{ display: 'block' }}>
      {open.what === 'edit'
        ? <EditEpisodeForm show={show} ep={e} onSaved={() => { setN((x) => x + 1); onChange(); }} onCancel={() => setOpen(null)} />
        : <PreviewEditor show={show} ep={e} onSaved={() => setN((x) => x + 1)} />}
    </li>
  ) : null);
  const extras = (e: Hosted) => (
    <>
      <button type="button" className="btn btn-quiet" disabled={busy} aria-expanded={open?.id === e.id && open.what === 'edit'} aria-label={`Edit: ${e.title}`} onClick={() => toggle(e.id, 'edit')}>Edit</button>
      {owner && e.paid ? (
        <button type="button" className="btn btn-quiet" disabled={busy} aria-expanded={open?.id === e.id && open.what === 'preview'} aria-label={`Free preview: ${e.title}`} onClick={() => toggle(e.id, 'preview')}>Free preview</button>
      ) : null}
    </>
  );
  return (
    <>
      {pending.length > 0 ? (
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
              <Fragment key={e.id}>
                <li>
                  {e.coverUrl ? <img src={e.coverUrl} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} /> : null}
                  <div className="row-main">
                    <div className="row-title">{e.title}</div>
                    <div className="row-sub">{e.status === 'draft' ? 'Draft' : `Scheduled for ${when(e.publishedAt)}`}{e.paid ? <span className="pill" style={{ marginLeft: 8 }}>Paid</span> : null}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {extras(e)}
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
                {opened(e)}
              </Fragment>
            ))}
          </ul>
        </section>
      ) : null}
      {paidLive.length > 0 ? (
        <section className="card" aria-labelledby="pl-h" style={{ marginBottom: 16 }}>
          <h2 id="pl-h">Paid episodes</h2>
          <p className="muted" style={{ marginTop: 0 }}>Published for listeners who bought the show.</p>
          {pending.length === 0 && error ? <p className="error" role="alert">{error}</p> : null}
          <ul className="rows">
            {paidLive.map((e) => (
              <Fragment key={e.id}>
                <li>
                  <div className="row-main">
                    <div className="row-title">{e.title}</div>
                    <div className="row-sub">Published {when(e.publishedAt)}{e.preview ? ` · free preview ${mmss(e.preview.startMs)} to ${mmss(e.preview.endMs)}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>{extras(e)}</div>
                </li>
                {opened(e)}
              </Fragment>
            ))}
          </ul>
        </section>
      ) : null}
      {del ? (
        <ConfirmDialog title={`Delete ${del.title}?`} body="The episode and its audio are removed for good." confirm="Delete" busy={busy}
          onCancel={() => setDel(null)} onConfirm={() => { const e = del; setDel(null); void run(() => api(`/v1/studio/shows/${show.key}/hosted-episodes/${e.id}`, { method: 'DELETE' })); }} />
      ) : null}
    </>
  );
}
