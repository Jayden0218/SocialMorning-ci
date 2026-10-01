import { useEffect, useState } from 'react';
import { api } from '../../api';
import { PageHead } from '../../shell/Page';
import { Empty, Failed, Loading } from '../../shell/States';
import { useDirty } from '../../shell/Unsaved';
import { useLoad } from '../../useLoad';
import { CHANGED_MESSAGE, errorText, Finder, isChanged, move, Reorder } from './common';

type Ref = { feedUrl: string; guid?: string; label?: string };
type Settings = { sections: string[]; version: number; order: string[]; hidden: string[]; pins: Ref[]; hides: { feedUrl: string; guid: string; label?: string }[] };

/** The phone's section ids, in words. */
const SECTION_LABEL: Record<string, string> = {
  forYou: 'For you', picks: 'Today\'s picks', chart: 'Talked about', shows: 'Popular shows', collections: 'Collections',
  video: 'Podcasts you can watch', followedHere: 'Followed here', said: 'What people said', newShows: 'New shows',
};
const refLabel = (r: Ref) => r.label ?? (r.guid ? `${r.feedUrl} · ${r.guid}` : `${r.feedUrl} · latest`);

/** Saved order first, then any section the save did not name, in the phone's own order. */
export function fullOrder(sections: readonly string[], order: readonly string[]): string[] {
  const known = order.filter((s) => sections.includes(s));
  return [...known, ...sections.filter((s) => !known.includes(s))];
}

/**
 * M15 T036 (FR-026–FR-029): Discover's sections (show/hide, order), up to 3 trending pins, trending
 * hides, and up to 5 featured shows per category. All of it applies on the phone's next refresh.
 */
export function DiscoverControl() {
  return (
    <>
      <PageHead title="Discover" sub="What the phone's Discover shows, and in which order. Changes apply on the next refresh." />
      <Sections />
      <Features />
    </>
  );
}

function Sections() {
  const [n, setN] = useState(0);
  const loaded = useLoad(() => api<Settings>('/v1/admin/discover'), [n]);
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [pins, setPins] = useState<Ref[]>([]);
  const [hides, setHides] = useState<Settings['hides']>([]);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDirty(dirty);
  const data = loaded.state === 'ready' ? loaded.data : null;
  useEffect(() => {
    if (!data) return;
    setOrder(fullOrder(data.sections, data.order)); setHidden(data.hidden); setPins(data.pins); setHides(data.hides); setVersion(data.version); setDirty(false);
  }, [data]);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ version: number }>('/v1/admin/discover', { method: 'PUT', body: {
        version, order, hidden,
        pins: pins.map((p) => ({ feedUrl: p.feedUrl, ...(p.guid ? { guid: p.guid } : {}) })),
        hides: hides.map((h) => ({ feedUrl: h.feedUrl, guid: h.guid })),
      } });
      setVersion(r.version); setDirty(false);
    } catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); } finally { setBusy(false); }
  };
  if (loaded.state === 'loading') return <section className="card"><Loading /></section>;
  if (loaded.state === 'error') return <section className="card"><Failed message={loaded.message} retry={loaded.retry} /></section>;
  return (
    <section className="card" aria-labelledby="ds-h">
      <h2 id="ds-h">Sections</h2>
      {error ? <p className="error" role="alert">{error}{isChangedText(error) ? <> <button type="button" className="linkish" onClick={() => setN((x) => x + 1)}>Reload</button></> : null}</p> : null}
      <ol className="rows section-list" aria-label="Sections in order">
        {order.map((s, i) => (
          <li key={s}>
            <label className="switch">
              <input type="checkbox" checked={!hidden.includes(s)} onChange={(e) => touch(setHidden)(e.target.checked ? hidden.filter((x) => x !== s) : [...hidden, s])} />
              {SECTION_LABEL[s] ?? s}
            </label>
            <Reorder i={i} n={order.length} name={SECTION_LABEL[s] ?? s} onMove={(d) => touch(setOrder)(move(order, i, d))} />
          </li>
        ))}
      </ol>
      <h3>Pinned to the top of trending (up to 3)</h3>
      {pins.length === 0 ? <p className="muted">Nothing pinned.</p> : (
        <ol className="rows" aria-label="Pinned episodes">
          {pins.map((p, i) => (
            <li key={`${p.feedUrl}|${p.guid ?? ''}`}>
              <span className="row-main">{refLabel(p)}</span>
              <span className="pick-actions">
                <Reorder i={i} n={pins.length} name={refLabel(p)} onMove={(d) => touch(setPins)(move(pins, i, d))} />
                <button type="button" className="linkish" onClick={() => touch(setPins)(pins.filter((_, j) => j !== i))}>Unpin</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {pins.length < 3 ? <Finder label="Find an episode to pin" onPick={(x) => { if ('guid' in x) touch(setPins)([...pins, { feedUrl: x.feedUrl, guid: x.guid, label: `${x.title} — ${x.showTitle}` }]); }} /> : null}
      <h3>Hidden from trending</h3>
      {hides.length === 0 ? <p className="muted">Nothing hidden.</p> : (
        <ul className="rows" aria-label="Hidden episodes">
          {hides.map((h, i) => (
            <li key={`${h.feedUrl}|${h.guid}`}>
              <span className="row-main">{refLabel(h)}</span>
              <button type="button" className="linkish" onClick={() => touch(setHides)(hides.filter((_, j) => j !== i))}>Show again</button>
            </li>
          ))}
        </ul>
      )}
      <Finder label="Find an episode to hide from trending" onPick={(x) => { if ('guid' in x) touch(setHides)([...hides, { feedUrl: x.feedUrl, guid: x.guid, label: `${x.title} — ${x.showTitle}` }]); }} />
      <div className="savebar" role="region" aria-label="Save Discover">
        <span className="muted">{dirty ? 'You have unsaved changes.' : 'Saved.'}</span>
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => { void save(); }}>{busy ? 'Saving…' : 'Save Discover'}</button>
      </div>
    </section>
  );
}

const isChangedText = (m: string) => m === CHANGED_MESSAGE;

function Features() {
  const cats = useLoad(() => api<{ categories: { genreId: number; name: string }[] }>('/v1/categories'), []);
  const [genre, setGenre] = useState<number | null>(null);
  const [shows, setShows] = useState<{ feedUrl: string; label?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (genre === null) return;
    let live = true;
    setMsg(null);
    api<{ shows: { feedUrl: string }[] }>(`/v1/admin/categories/${genre}/features`).then((r) => { if (live) setShows(r.shows); }, (e: unknown) => { if (live) setMsg(errorText(e)); });
    return () => { live = false; };
  }, [genre]);
  const save = async () => {
    if (genre === null) return;
    setBusy(true); setMsg(null);
    try { await api(`/v1/admin/categories/${genre}/features`, { method: 'PUT', body: { shows: shows.map((s) => ({ feedUrl: s.feedUrl })) } }); setMsg('Saved.'); }
    catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="cf-h">
      <h2 id="cf-h">Featured in a category (up to 5)</h2>
      {cats.state === 'error' ? <Failed message={cats.message} retry={cats.retry} /> : null}
      <div className="field">
        <label htmlFor="cf-genre">Category</label>
        <select id="cf-genre" className="select" value={genre ?? ''} onChange={(e) => setGenre(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Choose…</option>
          {cats.state === 'ready' ? cats.data.categories.map((c) => <option key={c.genreId} value={c.genreId}>{c.name}</option>) : null}
        </select>
      </div>
      {msg ? <p className="muted" role="status">{msg}</p> : null}
      {genre !== null ? (
        <>
          {shows.length === 0 ? <Empty title="Nothing featured — the chart's order" /> : (
            <ol className="rows" aria-label="Featured shows">
              {shows.map((s, i) => (
                <li key={s.feedUrl}>
                  <span className="row-main">{s.label ?? s.feedUrl}</span>
                  <span className="pick-actions">
                    <Reorder i={i} n={shows.length} name={s.label ?? s.feedUrl} onMove={(d) => setShows(move(shows, i, d))} />
                    <button type="button" className="linkish" onClick={() => setShows(shows.filter((_, j) => j !== i))}>Remove</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {shows.length < 5 ? <Finder label="Find a show to feature" kind="show" onPick={(x) => { if (!shows.some((s) => s.feedUrl === x.feedUrl)) setShows([...shows, { feedUrl: x.feedUrl, label: x.title }]); }} /> : null}
          <button type="button" className="btn" disabled={busy} onClick={() => { void save(); }}>{busy ? 'Saving…' : 'Save featured shows'}</button>
        </>
      ) : null}
    </section>
  );
}
