// Admin page for appeals (accept undoes the action, reject keeps it) and the account deletion queue.
import { useState } from 'react';
import { api } from '../../api';
import { shortDate } from '../../format';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { errorText } from './common';

type Appeal = {
  id: string; state: 'open' | 'accepted' | 'rejected'; text: string; createdAt: string; decidedAt: string | null;
  listener: { id: string; displayName: string; email: string; suspended: boolean };
  action: { id: string; action: string; targetKind: string; targetId: string; at: string };
  what: string;
};

/** M24 US6: what a listener appealed, newest decisions last. Accept undoes the action; Reject keeps it. Both tell the listener. */
export function Appeals() {
  const [state, setState] = useState<'open' | 'decided'>('open');
  const [n, setN] = useState(0);
  const data = useLoad(() => api<{ items: Appeal[] }>(`/v1/admin/appeals?state=${state}`), [state, n]);
  const [asking, setAsking] = useState<{ a: Appeal; verdict: 'accept' | 'reject' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (!asking) return;
    setBusy(true); setError(null);
    try { await api(`/v1/admin/appeals/${asking.a.id}/${asking.verdict}`, { method: 'POST' }); setN((x) => x + 1); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); setAsking(null); }
  };
  return (
    <>
      <PageHead title="Appeals" sub="Listeners asking us to look again. One appeal per action." />
      <div className="tabs" role="tablist" aria-label="Appeals" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" className="tab" aria-selected={state === 'open'} onClick={() => setState('open')}>Open</button>
        <button type="button" role="tab" className="tab" aria-selected={state === 'decided'} onClick={() => setState('decided')}>Decided</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="card" aria-label={state === 'open' ? 'Open appeals' : 'Decided appeals'}>
        {data.state === 'loading' ? <Loading /> : null}
        {data.state === 'error' ? <Failed message={data.message} retry={data.retry} /> : null}
        {data.state === 'ready' && data.data.items.length === 0 ? <Empty title={state === 'open' ? 'No appeals to decide' : 'Nothing decided yet'} /> : null}
        {data.state === 'ready' && data.data.items.length > 0 ? (
          <ul className="rows">
            {data.data.items.map((a) => (
              <li key={a.id} style={{ flexWrap: 'wrap' }}>
                <div className="row-main" style={{ flex: 1 }}>
                  <div className="row-title">{a.listener.displayName} <span className="row-sub">{a.listener.email}</span> {a.listener.suspended ? <span className="pill pill-warn">Suspended</span> : null}</div>
                  <div className="row-sub">{a.what} · {shortDate(a.action.at)}</div>
                  <blockquote className="row-body">{a.text}</blockquote>
                  <div className="row-sub">sent {shortDate(a.createdAt)}{a.decidedAt ? ` · ${a.state} ${shortDate(a.decidedAt)}` : ''}</div>
                </div>
                {a.state === 'open' ? (
                  <div className="pick-actions">
                    <button type="button" className="btn" disabled={busy} onClick={() => setAsking({ a, verdict: 'accept' })}>Accept<span className="sr-only"> — {a.listener.displayName}</span></button>
                    <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setAsking({ a, verdict: 'reject' })}>Reject<span className="sr-only"> — {a.listener.displayName}</span></button>
                  </div>
                ) : <span className="pill">{a.state}</span>}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {asking ? (
        <ConfirmDialog
          title={asking.verdict === 'accept' ? 'Accept and undo?' : 'Reject this appeal?'}
          body={asking.verdict === 'accept' ? (asking.a.action.action === 'suspend' ? 'The account works again at once.' : 'The removed item comes back for everyone.') : 'The decision stands. The listener is told.'}
          confirm={asking.verdict === 'accept' ? 'Accept' : 'Reject'} busy={busy}
          onCancel={() => setAsking(null)} onConfirm={() => { void run(); }} />
      ) : null}
    </>
  );
}

type Deletion = { listenerId: string; displayName: string; email: string; requestedAt: string; dueAt: string };

/** M24 US7: accounts that asked to be deleted, soonest first. The listener can still cancel from the app until the date. */
export function Deletions() {
  const data = useLoad(() => api<{ items: Deletion[] }>('/v1/admin/deletions'), []);
  return (
    <>
      <PageHead title="Deletions" sub="Accounts waiting to be deleted. Each goes on its date unless the listener signs in and keeps it." />
      <section className="card" aria-label="Waiting for deletion">
        {data.state === 'loading' ? <Loading /> : null}
        {data.state === 'error' ? <Failed message={data.message} retry={data.retry} /> : null}
        {data.state === 'ready' && data.data.items.length === 0 ? <Empty title="No account is waiting" /> : null}
        {data.state === 'ready' && data.data.items.length > 0 ? (
          <ul className="rows">
            {data.data.items.map((d) => (
              <li key={d.listenerId}>
                <div className="row-main"><div className="row-title">{d.displayName}</div><div className="row-sub">{d.email} · asked {shortDate(d.requestedAt)}</div></div>
                <span className="row-side">deleted {shortDate(d.dueAt)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}
