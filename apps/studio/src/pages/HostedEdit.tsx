// Forms for an episode made here: edit its title, notes and scheduled time; set a paid episode's free preview.
import { useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { mmss, parseMmss, toLocalInput } from '../format';

/** An episode uploaded in the Studio, as `GET …/hosted-episodes` lists it. */
export type Hosted = {
  id: string; episodeId: string; title: string; description?: string; status: 'draft' | 'published'; scheduled: boolean; publishedAt: string;
  coverUrl: string | null; paid?: boolean; paidAllowed?: boolean;
  /** M24 US13: the part of a paid episode anyone may play, when set. */
  preview?: { startMs: number; endMs: number };
};

/** M24 US14: change a hosted episode's title, show notes and — while it is scheduled — its time. */
export function EditEpisodeForm({ show, ep, onSaved, onCancel }: { show: Show; ep: Hosted; onSaved?: () => void; onCancel?: () => void }) {
  const [title, setTitle] = useState(ep.title);
  const [description, setDescription] = useState(ep.description ?? '');
  const [at, setAt] = useState(ep.scheduled ? toLocalInput(ep.publishedAt) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    const timeChanged = ep.scheduled && at && at !== toLocalInput(ep.publishedAt);
    try {
      await api(`/v1/studio/shows/${show.key}/hosted-episodes/${ep.id}`, { method: 'PUT', body: {
        title: title.trim(), description, ...(timeChanged ? { publishAt: new Date(at).toISOString() } : {}),
      } });
      setMsg({ ok: true, text: 'Saved' });
      onSaved?.();
    } catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="field"><label htmlFor={`he-t-${ep.id}`}>Episode title</label>
        <input id={`he-t-${ep.id}`} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label htmlFor={`he-d-${ep.id}`}>Show notes</label>
        <textarea id={`he-d-${ep.id}`} className="textarea" rows={5} maxLength={20000} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      {ep.scheduled ? (
        <div className="field"><label htmlFor={`he-a-${ep.id}`}>Publish time</label>
          <input id={`he-a-${ep.id}`} type="datetime-local" className="select" required value={at} onChange={(e) => setAt(e.target.value)} /></div>
      ) : null}
      {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn" type="submit" disabled={busy || !title.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        {onCancel ? <button type="button" className="btn btn-quiet" onClick={onCancel}>Close</button> : null}
      </div>
    </form>
  );
}

/** M24 US13: the part of a paid episode that listeners who have not bought the show can play. Owner only. */
export function PreviewEditor({ show, ep, onSaved }: { show: Show; ep: Hosted; onSaved?: () => void }) {
  const [start, setStart] = useState(ep.preview ? mmss(ep.preview.startMs) : '0:00');
  const [end, setEnd] = useState(ep.preview ? mmss(ep.preview.endMs) : '');
  const [has, setHas] = useState(Boolean(ep.preview));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const put = async (preview: { startMs: number; endMs: number } | null) => {
    setBusy(true); setMsg(null);
    try {
      await api(`/v1/studio/shows/${show.key}/hosted-episodes/${ep.id}/preview`, { method: 'PUT', body: { preview } });
      setHas(preview !== null);
      if (preview === null) { setStart('0:00'); setEnd(''); }
      setMsg({ ok: true, text: preview ? `Saved: ${mmss(preview.startMs)} to ${mmss(preview.endMs)} is free.` : 'Removed: no free preview.' });
      onSaved?.();
    } catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  const save = () => {
    const s = parseMmss(start);
    const e = parseMmss(end);
    if (s === null || e === null) { setMsg({ ok: false, text: 'Write each time as minutes:seconds, like 2:30.' }); return; }
    void put({ startMs: s, endMs: e });
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} aria-label={`Free preview of ${ep.title}`}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Listeners who have not bought the show can play this part. Up to 10 minutes.</p>
      <div className="toolbar">
        <div className="field" style={{ margin: 0 }}><label htmlFor={`pv-s-${ep.id}`}>Preview starts at</label>
          <input id={`pv-s-${ep.id}`} className="select" inputMode="numeric" placeholder="0:00" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor={`pv-e-${ep.id}`}>Preview ends at</label>
          <input id={`pv-e-${ep.id}`} className="select" inputMode="numeric" placeholder="5:00" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn" type="submit" disabled={busy}>Save preview</button>
        {has ? <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void put(null); }}>Remove preview</button> : null}
      </div>
    </form>
  );
}
