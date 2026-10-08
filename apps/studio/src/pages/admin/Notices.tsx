// Admin page to write a system notice to every listener, with an optional push.
import { useState } from 'react';
import { api } from '../../api';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { errorText } from './common';

type Notice = { id: string; title: string; body: string; createdAt: string; action?: { label: string; route: string }; push: boolean };

/** The app path a button may open: starts with one "/", no spaces, no web address. Same rule as the phone. */
export const isAppRoute = (r: string): boolean => /^\/(?!\/)[^\s\\:]{1,199}$/.test(r.trim());

/**
 * M24 US3: notices show on the phone's System page. The push is optional and reaches only
 * listeners whose "Popular content" switch is on.
 */
export function Notices() {
  const [n, setN] = useState(0);
  const data = useLoad(() => api<{ items: Notice[] }>('/v1/admin/notices'), [n]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [label, setLabel] = useState('');
  const [route, setRoute] = useState('');
  const [push, setPush] = useState(false);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const hasLink = label.trim() !== '' || route.trim() !== '';
  const linkOk = !hasLink || (label.trim() !== '' && isAppRoute(route));
  const send = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await api<{ pushed?: { sent: number } }>('/v1/admin/notices', { method: 'POST', body: { title: title.trim(), body: body.trim(), push, ...(hasLink ? { link: { label: label.trim(), route: route.trim() } } : {}) } });
      setTitle(''); setBody(''); setLabel(''); setRoute(''); setPush(false);
      setDone(r.pushed ? `Sent. Pushed to ${r.pushed.sent} phone${r.pushed.sent === 1 ? '' : 's'}.` : 'Sent.');
      setN((x) => x + 1);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); setAsking(false); }
  };
  const remove = async (x: Notice) => {
    setBusy(true); setError(null);
    try { await api(`/v1/admin/notices/${x.id}`, { method: 'DELETE' }); setN((v) => v + 1); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); setDeleting(null); }
  };
  return (
    <>
      <PageHead title="Notices" sub="Messages from SocialNet. Every listener sees them on the System page." />
      <section className="card" aria-labelledby="n-new">
        <h2 id="n-new">New notice</h2>
        <form style={{ display: 'grid', gap: 8, maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); setAsking(true); }}>
          <label htmlFor="n-title">Title</label>
          <input id="n-title" maxLength={80} required value={title} onChange={(e) => setTitle(e.target.value)} />
          <label htmlFor="n-body">Text</label>
          <textarea id="n-body" maxLength={1000} rows={4} required value={body} onChange={(e) => setBody(e.target.value)} />
          <label htmlFor="n-label">Button label (optional)</label>
          <input id="n-label" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
          <label htmlFor="n-route">Button opens (an app path, e.g. /inbox)</label>
          <input id="n-route" maxLength={200} placeholder="/inbox" value={route} onChange={(e) => setRoute(e.target.value)} aria-invalid={!linkOk} />
          {!linkOk ? <p className="error">A button needs a label and an app path starting with “/”.</p> : null}
          <label><input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} /> Also send a push (only to people with Popular content on)</label>
          <button className="btn" type="submit" disabled={busy || !title.trim() || !body.trim() || !linkOk}>Send</button>
        </form>
        {done ? <p role="status">{done}</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="n-sent">
        <h2 id="n-sent">Sent</h2>
        {data.state === 'loading' ? <Loading /> : null}
        {data.state === 'error' ? <Failed message={data.message} retry={data.retry} /> : null}
        {data.state === 'ready' && data.data.items.length === 0 ? <Empty title="No notices yet" /> : null}
        {data.state === 'ready' && data.data.items.length > 0 ? (
          <ul className="rows">
            {data.data.items.map((x) => (
              <li key={x.id} style={{ flexWrap: 'wrap' }}>
                <div className="row-main" style={{ flex: 1 }}>
                  <div className="row-title">{x.title} {x.push ? <span className="pill">Pushed</span> : null}</div>
                  <div className="row-body">{x.body}</div>
                  <div className="row-sub">{new Date(x.createdAt).toLocaleString('en')}{x.action ? ` · button “${x.action.label}” → ${x.action.route}` : ''}</div>
                </div>
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setDeleting(x)}>Delete<span className="sr-only"> {x.title}</span></button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {asking ? (
        <ConfirmDialog title="Send this notice to everyone?" body={push ? 'It shows on every phone, and a push goes out now. A push cannot be taken back.' : 'It shows on every phone.'}
          confirm="Send" busy={busy} onCancel={() => setAsking(false)} onConfirm={() => { void send(); }} />
      ) : null}
      {deleting ? (
        <ConfirmDialog title={`Delete “${deleting.title}”?`} body="It leaves every phone's System page. A push already sent stays sent."
          confirm="Delete" busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => { void remove(deleting); }} />
      ) : null}
    </>
  );
}
