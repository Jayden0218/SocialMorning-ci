// Page where a creator writes announcements and sends them to listeners.
import { useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { num, shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';

type A = { id: string; body: string; createdAt: string; editedAt: string | null; pushedAt: string | null };
type List = { items: A[]; pushesLeftThisMonth: number; resetsOn: string };

/** US5 — tell listeners something (FR-020, FR-021). */
export function Announcements({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<List>(`/v1/studio/shows/${show.key}/announcements`), [show.key, n]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const left = list.state === 'ready' ? list.data.pushesLeftThisMonth : null;
  const publish = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await api<{ pushed: { devices: number } }>(`/v1/studio/shows/${show.key}/announcements`, { method: 'POST', body: { body: text } });
      setText('');
      setDone(r.pushed.devices > 0 ? `Published and sent to ${num(r.pushed.devices)} device${r.pushed.devices === 1 ? '' : 's'}.` : 'Published. It is on your show page; no subscriber has notifications on yet.');
      setN((x) => x + 1);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'That did not work. Try again.');
    } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title="Announcements" sub="Appears on your show page in the app, and is sent as a notification to subscribers who allow them." />
      <section className="card" aria-labelledby="new-h">
        <h2 id="new-h">New announcement</h2>
        {left !== null ? (
          <p className="muted" style={{ marginTop: 0 }}>
            {left > 0 ? `${left} of 2 notifications left this month.` : `No notifications left this month — they reset on ${shortDate(list.state === 'ready' ? list.data.resetsOn : null)}.`}
          </p>
        ) : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
        {done ? <p className="muted" role="status">{done}</p> : null}
        <form onSubmit={(e) => { e.preventDefault(); void publish(); }}>
          <div className="field">
            <label htmlFor="ann">Message</label>
            <textarea id="ann" className="textarea" rows={4} maxLength={500} required value={text} onChange={(e) => setText(e.target.value)} placeholder="New season starts Monday…" />
            <span className="muted num" style={{ fontSize: 13, textAlign: 'right' }}>{text.length} / 500</span>
          </div>
          <button className="btn" type="submit" disabled={busy || !text.trim() || left === 0}>{busy ? 'Publishing…' : 'Publish and notify'}</button>
        </form>
      </section>
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="past-h">
        <h2 id="past-h">Published</h2>
        {list.state === 'loading' ? <Loading /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="Nothing published yet" /> : null}
        {list.state === 'ready' ? list.data.items.map((a) => <Item key={a.id} show={show} a={a} onChanged={() => setN((x) => x + 1)} />) : null}
      </section>
    </>
  );
}

function Item({ show, a, onChanged }: { show: Show; a: A; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(a.body);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  return (
    <article className="comment">
      <div className="comment-meta"><span>{shortDate(a.createdAt)}</span>{a.editedAt ? <span className="pill">Edited</span> : null}{a.pushedAt ? <span className="pill">Notified</span> : null}</div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void run(() => api(`/v1/studio/shows/${show.key}/announcements/${a.id}`, { method: 'PUT', body: { body: text } })).then(() => setEditing(false)); }}>
          <label className="sr-only" htmlFor={`e-${a.id}`}>Edit announcement</label>
          <textarea id={`e-${a.id}`} className="textarea" rows={3} maxLength={500} required value={text} onChange={(e) => setText(e.target.value)} />
          <p className="muted" style={{ fontSize: 13 }}>Editing changes the text in the app. It does not notify anyone again.</p>
          <div className="comment-actions"><button className="btn" type="submit" disabled={busy}>Save</button><button type="button" className="btn btn-quiet" onClick={() => { setEditing(false); setText(a.body); }}>Cancel</button></div>
        </form>
      ) : (
        <>
          <p className="comment-body">{a.body}</p>
          <div className="comment-actions">
            <button type="button" className="linkish" onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className="linkish" onClick={() => setConfirm(true)}>Delete</button>
          </div>
        </>
      )}
      {confirm ? (
        <ConfirmDialog title="Delete this announcement?" body="It disappears from your show page. Notifications already sent cannot be taken back." confirm="Delete" busy={busy}
          onCancel={() => setConfirm(false)} onConfirm={() => { void run(() => api(`/v1/studio/shows/${show.key}/announcements/${a.id}`, { method: 'DELETE' })).then(() => setConfirm(false)); }} />
      ) : null}
    </article>
  );
}
