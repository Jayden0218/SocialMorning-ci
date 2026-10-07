// Page where a creator writes announcements with pictures, schedules them and sends them to listeners.
import { useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { num, shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';
import { noun } from '@socialmorning/social-core';
import { ANNOUNCEMENT_TYPES, MAX_ANNOUNCEMENT_BYTES, uploadAnnouncementImage } from '../upload';

/** M19 US12: up to 9 pictures; `releaseAt` in the future = scheduled (listed from then, not pushed). */
type A = { id: string; body: string; createdAt: string; editedAt: string | null; pushedAt: string | null; images?: string[]; releaseAt?: string };
const MAX_PICTURES = 9;
const scheduled = (a: A) => !!a.releaseAt && new Date(a.releaseAt).getTime() > Date.now();
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
type List = { items: A[]; pushesLeftThisMonth: number; resetsOn: string };

/** US5 — tell listeners something (FR-020, FR-021). */
export function Announcements({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<List>(`/v1/studio/shows/${show.key}/announcements`), [show.key, n]);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [later, setLater] = useState(false);
  const [at, setAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const left = list.state === 'ready' ? list.data.pushesLeftThisMonth : null;
  const releaseAt = later && at ? new Date(at) : null;
  const badTime = releaseAt !== null && (Number.isNaN(releaseAt.getTime()) || releaseAt.getTime() <= Date.now());
  const publish = async () => {
    if (later && (!releaseAt || badTime)) { setError('Choose a time in the future, or turn off "Publish later".'); return; }
    setBusy(true); setError(null); setDone(null);
    try {
      const body = { body: text, ...(images.length ? { images } : {}), ...(releaseAt ? { releaseAt: releaseAt.toISOString() } : {}) };
      const r = await api<{ pushed: { devices: number } }>(`/v1/studio/shows/${show.key}/announcements`, { method: 'POST', body });
      setText(''); setImages([]); setLater(false); setAt('');
      setDone(releaseAt ? `Scheduled for ${when(releaseAt.toISOString())}. It appears on your show page then; a scheduled announcement sends no notification.` : r.pushed.devices > 0 ? `Published and sent to ${num(r.pushed.devices)} ${noun(r.pushed.devices, 'device')}.` : 'Published. It is on your show page; no subscriber has notifications on yet.');
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
          <Pictures show={show} id="ann-pics" images={images} onChange={setImages} onError={setError} />
          <label className="radio"><input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> Publish later</label>
          <div className="field">
            {later ? (
              <>
                <label htmlFor="ann-at" className="sr-only">Publish at</label>
                <input id="ann-at" type="datetime-local" className="select" value={at} onChange={(e) => setAt(e.target.value)} aria-invalid={badTime || undefined} />
                <span className="muted" style={{ fontSize: 13 }}>Saved now and shown from this time, in your time zone. A scheduled announcement is not sent as a notification.</span>
              </>
            ) : null}
          </div>
          <button className="btn" type="submit" disabled={busy || !text.trim() || (!later && left === 0) || (later && (!at || badTime))}>
            {busy ? 'Publishing…' : later ? 'Schedule' : 'Publish and notify'}
          </button>
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
  const [images, setImages] = useState<string[]>(a.images ?? []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  return (
    <article className="comment">
      <div className="comment-meta"><span>{shortDate(a.createdAt)}</span>{a.editedAt ? <span className="pill">Edited</span> : null}{a.pushedAt ? <span className="pill">Notified</span> : null}{scheduled(a) && a.releaseAt ? <span className="pill pill-warn">Scheduled for {when(a.releaseAt)}</span> : null}</div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void run(() => api(`/v1/studio/shows/${show.key}/announcements/${a.id}`, { method: 'PUT', body: { body: text, images } })).then(() => setEditing(false)); }}>
          <label className="sr-only" htmlFor={`e-${a.id}`}>Edit announcement</label>
          <textarea id={`e-${a.id}`} className="textarea" rows={3} maxLength={500} required value={text} onChange={(e) => setText(e.target.value)} />
          <Pictures show={show} id={`ep-${a.id}`} images={images} onChange={setImages} onError={setError} />
          <p className="muted" style={{ fontSize: 13 }}>Editing changes the text in the app. It does not notify anyone again.</p>
          <div className="comment-actions"><button className="btn" type="submit" disabled={busy}>Save</button><button type="button" className="btn btn-quiet" onClick={() => { setEditing(false); setText(a.body); setImages(a.images ?? []); }}>Cancel</button></div>
        </form>
      ) : (
        <>
          <p className="comment-body">{a.body}</p>
          {a.images?.length ? <div className="thumbs">{a.images.map((u, i) => <img key={u} className="thumb" src={u} alt={`Picture ${i + 1}`} />)}</div> : null}
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

/** M19 US12: up to 9 pictures — each uploaded straight to storage, shown as a thumbnail with Remove. */
function Pictures({ show, id, images, onChange, onError }: { show: Show; id: string; images: string[]; onChange: (v: string[]) => void; onError: (m: string | null) => void }) {
  const [pct, setPct] = useState<number | null>(null);
  const add = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, MAX_PICTURES - images.length);
    onError(null);
    let next = images;
    for (const f of list) {
      if (!ANNOUNCEMENT_TYPES.includes(f.type)) { onError('Pictures must be JPEG or PNG.'); continue; }
      if (f.size > MAX_ANNOUNCEMENT_BYTES) { onError(`${f.name} is over 5 MB.`); continue; }
      try {
        setPct(0);
        const url = await uploadAnnouncementImage(show.key, f, setPct);
        next = [...next, url];
        onChange(next);
      } catch (e) { onError(e instanceof HttpError ? e.message : 'The picture did not upload. Try again.'); }
    }
    setPct(null);
  };
  return (
    <div className="field">
      <label htmlFor={id}>Pictures <span className="muted num">({images.length} / {MAX_PICTURES})</span></label>
      {images.length ? (
        <div className="thumbs">
          {images.map((u, i) => (
            <div key={u} className="thumb-box">
              <img className="thumb" src={u} alt={`Picture ${i + 1}`} />
              <button type="button" className="linkish" onClick={() => onChange(images.filter((x) => x !== u))}>Remove<span className="sr-only"> picture {i + 1}</span></button>
            </div>
          ))}
        </div>
      ) : null}
      {images.length < MAX_PICTURES ? (
        <input id={id} type="file" accept={ANNOUNCEMENT_TYPES.join(',')} multiple disabled={pct !== null}
          onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
      ) : null}
      {pct !== null ? <span className="muted num" role="status" style={{ fontSize: 13 }}>Uploading… {pct}%</span> : null}
    </div>
  );
}
