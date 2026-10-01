import { useEffect, useState, type DragEvent } from 'react';
import { api } from '../../api';
import { PageHead } from '../../shell/Page';
import { Failed, Loading } from '../../shell/States';
import { useDirty } from '../../shell/Unsaved';
import { useLoad } from '../../useLoad';
import { CHANGED_MESSAGE, errorText, Finder, isChanged, move, Reorder, utcDay, type EpisodeCard } from './common';
import { PhonePreview } from './PhonePreview';

type Month = { today: string; days: { day: string; count: number; source: 'admin' | 'file' }[] };
type DayItem = { feedUrl: string; guid?: string; why: string; warning?: string; episode: (EpisodeCard & { id: string }) | null };
type Day = { day: string; version: number; source: 'admin' | 'file' | 'none'; items: DayItem[] };
type Draft = { feedUrl: string; guid?: string; why: string; title: string; showTitle: string; imageUrl?: string; warning?: string };

const MAX = 5;
const QUOTE = 140;
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthName = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const toDraft = (i: DayItem): Draft => ({
  feedUrl: i.feedUrl, ...(i.guid ? { guid: i.guid } : {}), why: i.why, title: i.episode?.title ?? (i.guid ? 'Episode not loaded yet' : 'The show\'s latest episode'),
  showTitle: i.episode?.showTitle ?? i.feedUrl, ...(i.episode?.imageUrl ? { imageUrl: i.episode.imageUrl } : {}), ...(i.warning ? { warning: i.warning } : {}),
});

/**
 * M15 T016 (FR-006–FR-012): a month calendar (admin days and file days told apart), a day editor
 * (search, quote ≤ 140, reorder by arrows or drag), Save with the version it loaded — a save over
 * a newer one is refused with "Changed elsewhere — reload" — and the phone preview beside it.
 * Days are UTC, the boundary the server and the phone use.
 */
export function Picks() {
  const today = utcDay();
  const [ym, setYm] = useState<[number, number]>(() => [Number(today.slice(0, 4)), Number(today.slice(5, 7))]);
  const [day, setDay] = useState(today);
  const [stamp, setStamp] = useState(0);
  const [y, m] = ym;
  const from = `${y}-${pad(m)}-01`;
  const to = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
  const month = useLoad(() => api<Month>(`/v1/admin/picks?from=${from}&to=${to}`), [from, to, stamp]);
  const shift = (d: -1 | 1) => setYm(([yy, mm]) => (mm + d < 1 ? [yy - 1, 12] : mm + d > 12 ? [yy + 1, 1] : [yy, mm + d]));
  const byDay = new Map((month.state === 'ready' ? month.data.days : []).map((d) => [d.day, d]));
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return (
    <>
      <PageHead title="Picks" sub="Choose up to 5 episodes a day, each with a short quote. The phone shows them that day — no deploy." />
      <div className="grid-2 admin-split">
        <div>
          <section className="card" aria-labelledby="cal-h">
            <div className="card-head">
              <button type="button" className="btn btn-quiet" onClick={() => shift(-1)} aria-label="Previous month">←</button>
              <h2 id="cal-h">{monthName(y, m)}</h2>
              <button type="button" className="btn btn-quiet" onClick={() => shift(1)} aria-label="Next month">→</button>
            </div>
            {month.state === 'error' ? <Failed message={month.message} retry={month.retry} /> : null}
            {month.state === 'loading' ? <Loading lines={4} /> : null}
            <div className="calendar">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => <div key={w} className="cal-head" aria-hidden="true">{w}</div>)}
              {Array.from({ length: lead }, (_, i) => <div key={`lead-${i}`} aria-hidden="true" />)}
              {Array.from({ length: lastDay(y, m) }, (_, i) => {
                const d = `${y}-${pad(m)}-${pad(i + 1)}`;
                const info = byDay.get(d);
                const label = `${longDay(d)}${info ? ` — ${info.count} pick${info.count === 1 ? '' : 's'}, ${info.source === 'admin' ? 'set in Admin' : 'from the file'}` : ' — empty'}${d === today ? ', today' : ''}`;
                return (
                  <button key={d} type="button" aria-pressed={d === day} aria-label={label}
                    className={`cal-day${info ? ` cal-${info.source}` : ''}${d === today ? ' cal-today' : ''}`} onClick={() => setDay(d)}>
                    <span>{i + 1}</span>
                    {info ? <span className="cal-mark" aria-hidden="true">{info.source === 'admin' ? `${info.count}` : `file ${info.count}`}</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="muted cal-key"><span className="cal-swatch cal-admin" aria-hidden="true" /> set in Admin · <span className="cal-swatch cal-file" aria-hidden="true" /> from the picks file (the fallback)</p>
          </section>
          <DayEditor key={day} day={day} onSaved={() => setStamp((s) => s + 1)} />
        </div>
        <PhonePreview day={day} stamp={stamp} />
      </div>
    </>
  );
}

function DayEditor({ day, onSaved }: { day: string; onSaved: () => void }) {
  const [n, setN] = useState(0);
  const loaded = useLoad(() => api<Day>(`/v1/admin/picks/${day}`), [day, n]);
  const [items, setItems] = useState<Draft[]>([]);
  const [version, setVersion] = useState(0);
  const [dirty, setDirtyState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  useDirty(dirty);
  const data = loaded.state === 'ready' ? loaded.data : null;
  useEffect(() => {
    if (!data) return;
    setItems(data.items.map(toDraft));
    setVersion(data.version);
    setDirtyState(false); setStale(false);
  }, [data]);
  const edit = (next: Draft[]) => { setItems(next); setDirtyState(true); };
  const add = (e: EpisodeCard) => {
    if (items.length >= MAX) return;
    edit([...items, { feedUrl: e.feedUrl, guid: e.guid, why: '', title: e.title, showTitle: e.showTitle, ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}) }]);
  };
  const save = async () => {
    setBusy(true); setError(null); setNotes([]);
    try {
      const r = await api<{ version: number; warnings: string[] }>(`/v1/admin/picks/${day}`, { method: 'PUT', body: {
        version, items: items.map((i) => ({ feedUrl: i.feedUrl, ...(i.guid ? { guid: i.guid } : {}), why: i.why.trim() })),
      } });
      setVersion(r.version); setDirtyState(false); setNotes(r.warnings); onSaved();
      setN((x) => x + 1);
    } catch (e) {
      if (isChanged(e)) setStale(true);
      setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e));
    } finally { setBusy(false); }
  };
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (drag === null || drag === to) return;
    const next = [...items];
    const [x] = next.splice(drag, 1);
    if (x) next.splice(to, 0, x);
    setDrag(null);
    edit(next);
  };
  const invalid = items.some((i) => i.why.trim().length < 1 || i.why.trim().length > QUOTE);
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="day-h">
      <h2 id="day-h">{longDay(day)}</h2>
      {loaded.state === 'loading' ? <Loading /> : null}
      {loaded.state === 'error' ? <Failed message={loaded.message} retry={loaded.retry} /> : null}
      {loaded.state === 'ready' && loaded.data.source === 'file' && !dirty ? <p className="muted">These come from the picks file. Saving makes them Admin picks for this day.</p> : null}
      {loaded.state === 'ready' && loaded.data.source === 'none' && items.length === 0 ? <p className="muted">Nothing set — the phone shows the latest earlier day's picks.</p> : null}
      {error ? (
        <p className="error" role="alert">{error}{stale ? <> <button type="button" className="linkish" onClick={() => setN((x) => x + 1)}>Reload</button></> : null}</p>
      ) : null}
      {notes.length > 0 ? <div className="banner" role="status"><span>Saved. {notes.length === 1 ? 'One pick' : `${notes.length} picks`} did not resolve and the phone will skip {notes.length === 1 ? 'it' : 'them'}: {notes.join('; ')}</span></div> : null}
      <ol className="rows pick-list" aria-label="Picks for this day, in order">
        {items.map((it, i) => {
          const len = it.why.trim().length;
          const id = `why-${i}`;
          return (
            <li key={`${it.feedUrl}|${it.guid ?? ''}|${i}`} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, i)} className="pick-row">
              <div className="mini-show">
                {it.imageUrl ? <img src={it.imageUrl} alt="" /> : <div className="ph" aria-hidden="true" />}
                <div className="row-main">
                  <div className="row-title">{i + 1}. {it.title}</div>
                  <div className="row-sub">{it.showTitle}</div>
                  {it.warning ? <div className="row-sub"><span className="pill pill-warn">Did not resolve</span> {it.warning}</div> : null}
                </div>
              </div>
              <div className="field pick-quote">
                <label htmlFor={id}>Quote</label>
                <textarea id={id} className="textarea" rows={2} maxLength={QUOTE + 20} value={it.why} aria-describedby={`${id}-n`}
                  onChange={(e) => edit(items.map((x, j) => (j === i ? { ...x, why: e.target.value } : x)))} />
                <span id={`${id}-n`} className={`muted num${len > QUOTE ? ' over' : ''}`}>{len} / {QUOTE}</span>
              </div>
              <div className="pick-actions">
                <Reorder i={i} n={items.length} name={it.title} onMove={(d) => edit(move(items, i, d))} />
                <button type="button" className="linkish" onClick={() => edit(items.filter((_, j) => j !== i))}>Remove<span className="sr-only"> {it.title}</span></button>
              </div>
            </li>
          );
        })}
      </ol>
      {items.length < MAX ? <Finder label="Find an episode to add" onPick={(x) => { if ('guid' in x) add(x); }} /> : <p className="muted">5 picks is the most for one day.</p>}
      <div className="savebar" role="region" aria-label="Save picks">
        <span className="muted">{dirty ? 'You have unsaved changes.' : items.length === 0 ? 'Saving no picks clears this day.' : 'Saved.'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {dirty ? <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setN((x) => x + 1)}>Undo changes</button> : null}
          <button type="button" className="btn" disabled={!dirty || busy || invalid} onClick={() => { void save(); }}>{busy ? 'Saving…' : 'Save picks'}</button>
        </div>
      </div>
    </section>
  );
}
