// Admin page for blocked words and the maintenance switch.
import { useState } from 'react';
import { api } from '../../api';
import { shortDate } from '../../format';
import { ConfirmDialog } from '../../shell/ConfirmDialog';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { errorText } from './common';

type Word = { word: string; addedBy: string | null; addedAt: string };
type Maint = { until: string; message: string };
type MaintState = { stored: Maint | null; active: Maint | null };

/** Words from the box: one per line or comma, trimmed, empty ones dropped. */
export function splitWords(raw: string): string[] {
  return raw.split(/[\n,，]/).map((w) => w.trim()).filter((w) => w !== '');
}

/** A `datetime-local` value (local time, no zone) → an ISO time, or null when empty or not a time. */
export function localToIso(v: string): string | null {
  if (!v) return null;
  const at = new Date(v).getTime();
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/**
 * M24 US2 + US4: the blocked words (a comment, status, chat message, list title or name holding
 * one is refused) and the maintenance switch (every app call answers "under maintenance" until
 * the end time; Admin keeps working).
 */
export function Safety() {
  return (
    <>
      <PageHead title="Safety" sub="Blocked words and the maintenance switch." />
      <Words />
      <Maintenance />
    </>
  );
}

function Words() {
  const [n, setN] = useState(0);
  const data = useLoad(() => api<{ items: Word[] }>('/v1/admin/words'), [n]);
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    const words = splitWords(raw);
    if (words.length === 0) return;
    setBusy(true); setError(null);
    try { await api('/v1/admin/words', { method: 'POST', body: { words } }); setRaw(''); setN((x) => x + 1); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const remove = async (w: string) => {
    setBusy(true); setError(null);
    try { await api(`/v1/admin/words/${encodeURIComponent(w)}`, { method: 'DELETE' }); setN((x) => x + 1); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="w-h">
      <h2 id="w-h">Blocked words</h2>
      <p className="muted">A comment, status, chat message, list title or name with one of these is refused. English words match whole words only; Chinese matches anywhere.</p>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <label className="sr-only" htmlFor="w-new">Words to block, one per line or comma</label>
        <textarea id="w-new" rows={2} placeholder="One per line or comma" value={raw} onChange={(e) => setRaw(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || splitWords(raw).length === 0}>Block</button>
      </form>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {data.state === 'loading' ? <Loading /> : null}
      {data.state === 'error' ? <Failed message={data.message} retry={data.retry} /> : null}
      {data.state === 'ready' && data.data.items.length === 0 ? <Empty title="No blocked words" /> : null}
      {data.state === 'ready' && data.data.items.length > 0 ? (
        <ul className="rows">
          {data.data.items.map((w) => (
            <li key={w.word}>
              <div className="row-main"><div className="row-title">{w.word}</div><div className="row-sub">added {shortDate(w.addedAt)}{w.addedBy ? ` by ${w.addedBy}` : ''}</div></div>
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void remove(w.word); }}>Remove<span className="sr-only"> {w.word}</span></button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Maintenance() {
  const [n, setN] = useState(0);
  const data = useLoad(() => api<MaintState>('/v1/admin/maintenance'), [n]);
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [asking, setAsking] = useState<'on' | 'off' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (on: boolean) => {
    setBusy(true); setError(null);
    try {
      await api('/v1/admin/maintenance', { method: 'PUT', body: on ? { on, message: message.trim() || undefined, until: localToIso(until) ?? '' } : { on } });
      setN((x) => x + 1);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); setAsking(null); }
  };
  const active = data.state === 'ready' ? data.data.active : null;
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="m-h">
      <h2 id="m-h">Maintenance</h2>
      {data.state === 'loading' ? <Loading lines={1} /> : null}
      {data.state === 'error' ? <Failed message={data.message} retry={data.retry} /> : null}
      {active ? (
        <p role="status"><span className="pill pill-warn">On</span> until {new Date(active.until).toLocaleString('en')} — “{active.message}”</p>
      ) : data.state === 'ready' ? <p role="status"><span className="pill">Off</span> The app works as usual.</p> : null}
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setAsking('on'); }}>
        <label htmlFor="m-msg">Message</label>
        <input id="m-msg" maxLength={200} placeholder="SocialNet is being updated." value={message} onChange={(e) => setMessage(e.target.value)} />
        <label htmlFor="m-until">Ends at</label>
        <input id="m-until" type="datetime-local" required value={until} onChange={(e) => setUntil(e.target.value)} />
        <button className="btn" type="submit" disabled={busy || !localToIso(until)}>{active ? 'Update' : 'Turn on'}</button>
        {active ? <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => setAsking('off')}>Turn off</button> : null}
      </form>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {asking ? (
        <ConfirmDialog
          title={asking === 'on' ? 'Turn maintenance on?' : 'Turn maintenance off?'}
          body={asking === 'on' ? 'Every app call answers “under maintenance” until the end time. Admin keeps working.' : 'The app works again at once.'}
          confirm={asking === 'on' ? 'Turn on' : 'Turn off'} busy={busy}
          onCancel={() => setAsking(null)} onConfirm={() => { void save(asking === 'on'); }} />
      ) : null}
    </section>
  );
}
