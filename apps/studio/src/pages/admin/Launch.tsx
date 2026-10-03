// Admin page to manage promotion images shown on the app's launch screen.
import { useState } from 'react';
import { api } from '../../api';
import { num, shortDate } from '../../format';
import { DropZone } from '../../shell/DropZone';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useDirty } from '../../shell/Unsaved';
import { LAUNCH_TYPES, MAX_LAUNCH_BYTES, mb, uploadLaunchImage } from '../../upload';
import { useLoad } from '../../useLoad';
import { errorText } from './common';

type Promotion = {
  id: string; imageUrl: string; imageBytes: number; targetKind: 'route' | 'url'; target: string; label: string;
  startsAt: string; endsAt: string; weight: number; dailyCap: number; impressions: number; taps: number; state: 'draft' | 'live' | 'ended' | 'retired';
};
type List = { items: Promotion[]; usedBytes: number; ceilingBytes: number };

/** Pages in the app a promotion may open. Anything the app no longer has opens Discover (the phone decides). */
export const APP_ROUTES = [
  { path: '/', label: 'Discover' },
  { path: '/categories', label: 'Categories' },
  { path: '/chart', label: 'Talked-about chart' },
  { path: '/issues', label: 'Issues' },
  { path: '/picks/past', label: 'Past picks' },
  { path: '/search', label: 'Search' },
  { path: '/academy', label: 'Academy' },
] as const;

const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const STATE_LABEL: Record<Promotion['state'], string> = { draft: 'Scheduled', live: 'Live', ended: 'Ended', retired: 'Retired' };

/**
 * M15 T021 (FR-013–FR-017): the owner's own promotions for the launch screen. One image (≤ 1 MB;
 * 50 MB for all), where a tap leads, the label, the dates, weight and the per-device daily cap.
 * Counts are totals only — nothing here is about a person.
 */
export function Launch() {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<List>('/v1/admin/launch'), [n]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const patch = async (p: Promotion, body: Record<string, unknown>) => {
    setBusyId(p.id); setError(null);
    try { await api(`/v1/admin/launch/${p.id}`, { method: 'PATCH', body }); setN((x) => x + 1); }
    catch (e) { setError(errorText(e)); } finally { setBusyId(null); }
  };
  return (
    <>
      <PageHead title="Launch screen" sub="Your own promotion, shown for up to 3 seconds with Skip — only when its image is already on the phone." />
      <NewPromotion onMade={() => setN((x) => x + 1)} />
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="pl-h">
        <div className="card-head">
          <h2 id="pl-h">Promotions</h2>
          {list.state === 'ready' ? <span className="muted num">{mb(list.data.usedBytes)} of {mb(list.data.ceilingBytes)} used</span> : null}
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {list.state === 'loading' ? <Loading /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="No promotions yet" /> : null}
        {list.state === 'ready' ? (
          <ul className="rows">
            {list.data.items.map((p) => (
              <li key={p.id}>
                <div className="mini-show">
                  <img src={p.imageUrl} alt="" />
                  <div className="row-main">
                    <div className="row-title"><span className={`pill${p.state === 'live' ? ' pill-warn' : ''}`}>{STATE_LABEL[p.state]}</span> {p.label} → {p.target}</div>
                    <div className="row-sub">{shortDate(p.startsAt)} to {shortDate(p.endsAt)} · weight {p.weight} · {p.dailyCap} a day per phone</div>
                    <div className="row-sub num">{num(p.impressions)} shown · {num(p.taps)} taps</div>
                  </div>
                </div>
                {p.state === 'retired'
                  ? <button type="button" className="btn btn-quiet" disabled={busyId === p.id} onClick={() => { void patch(p, { retired: false }); }}>Restore<span className="sr-only"> {p.label}</span></button>
                  : <button type="button" className="btn btn-quiet" disabled={busyId === p.id} onClick={() => { void patch(p, { retired: true }); }}>Retire<span className="sr-only"> {p.label}</span></button>}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

function NewPromotion({ onMade }: { onMade: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [kind, setKind] = useState<'route' | 'url'>('route');
  const [route, setRoute] = useState<string>(APP_ROUTES[0].path);
  const [url, setUrl] = useState('https://');
  const [label, setLabel] = useState('Promotion');
  const [starts, setStarts] = useState(() => local(new Date()));
  const [ends, setEnds] = useState(() => local(new Date(Date.now() + 7 * 86_400_000)));
  const [weight, setWeight] = useState(1);
  const [cap, setCap] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = imageUrl !== null;
  useDirty(dirty);
  const onFile = async (f: File) => {
    setError(null);
    if (!LAUNCH_TYPES.includes(f.type)) { setError('Upload a JPEG, PNG or WebP image.'); return; }
    if (f.size > MAX_LAUNCH_BYTES) { setError(`The image is ${mb(f.size)} — the limit is 1 MB. Make it smaller and try again.`); return; }
    setPct(0);
    try { setImageUrl(await uploadLaunchImage(f, setPct)); } catch (e) { setError(errorText(e)); } finally { setPct(null); }
  };
  const create = async () => {
    if (!imageUrl) return;
    setBusy(true); setError(null);
    try {
      await api('/v1/admin/launch', { method: 'POST', body: {
        imageUrl, targetKind: kind, target: kind === 'route' ? route : url.trim(), label: label.trim() || 'Promotion',
        startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString(), weight, dailyCap: cap,
      } });
      setImageUrl(null); setLabel('Promotion'); onMade();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const ok = imageUrl !== null && (kind === 'route' || /^https:\/\/\S+\.\S+/.test(url.trim())) && new Date(ends) > new Date(starts);
  return (
    <section className="card" aria-labelledby="np-h">
      <h2 id="np-h">New promotion</h2>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="toolbar" style={{ alignItems: 'flex-start' }}>
        <DropZone label="Drop the image here (≤ 1 MB)" url={imageUrl} busyPct={pct} accept="image/jpeg,image/png,image/webp" onFile={(f) => { void onFile(f); }} size={160} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>A tap opens</legend>
            <label className="radio"><input type="radio" name="kind" checked={kind === 'route'} onChange={() => setKind('route')} /> A page in the app</label>
            <label className="radio"><input type="radio" name="kind" checked={kind === 'url'} onChange={() => setKind('url')} /> A web address</label>
          </fieldset>
          {kind === 'route' ? (
            <div className="field"><label htmlFor="np-route">Page</label>
              <select id="np-route" className="select" value={route} onChange={(e) => setRoute(e.target.value)}>
                {APP_ROUTES.map((r) => <option key={r.path} value={r.path}>{r.label} ({r.path})</option>)}
              </select>
            </div>
          ) : (
            <div className="field"><label htmlFor="np-url">Web address (https only)</label><input id="np-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          )}
          <div className="field"><label htmlFor="np-label">Label shown on the screen ({label.trim().length} / 20)</label><input id="np-label" maxLength={20} value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        </div>
      </div>
      <div className="toolbar">
        <div className="field" style={{ margin: 0 }}><label htmlFor="np-start">Starts</label><input id="np-start" type="datetime-local" className="select" value={starts} onChange={(e) => setStarts(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="np-end">Ends</label><input id="np-end" type="datetime-local" className="select" value={ends} onChange={(e) => setEnds(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="np-w">Weight (1–100)</label><input id="np-w" type="number" className="select" min={1} max={100} value={weight} onChange={(e) => setWeight(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="np-cap">Times a day per phone (1–5)</label><input id="np-cap" type="number" className="select" min={1} max={5} value={cap} onChange={(e) => setCap(Math.min(5, Math.max(1, Number(e.target.value) || 1)))} /></div>
      </div>
      <button type="button" className="btn" disabled={!ok || busy} onClick={() => { void create(); }}>{busy ? 'Saving…' : 'Save promotion'}</button>
    </section>
  );
}
