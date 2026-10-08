// Admin page controlling which Discover sections the app draws, and in which order.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api';
import { PageHead } from '../../shell/Page';
import { Failed, Loading } from '../../shell/States';
import { useDirty } from '../../shell/Unsaved';
import { useLoad } from '../../useLoad';
import { CHANGED_MESSAGE, errorText, isChanged, move, Reorder } from './common';

type Split = Record<string, readonly [string, boolean]>;
type Settings = { sections: string[]; splitFrom?: Split; version: number; order: string[]; hidden: string[] };

/**
 * The phone's section ids, in the words the phone shows (M25 A5: one switch per thing drawn —
 * the bundles of M15 are split, and "Followed here", which drew nothing, is gone).
 */
export const SECTION_LABEL: Record<string, string> = {
  picks: "Editor's picks", theirLikes: 'Their likes', forYou: 'For You', pickedShows: 'Shows picked for you',
  chart: 'Charts (Top · Talked about · New shows)', categories: 'Explore by category', shows: 'Popular shows',
  premium: 'Premium picks', video: 'Podcasts you can watch', collections: 'Topic lists', said: 'What listeners said',
  newShows: 'New arrivals', hunt: 'Treasure hunt',
};

/**
 * Saved order first, then any section the save did not name, in the phone's own order. M25 A5: a
 * section split from another (`splitFrom`) that an older save does not name sits right after the
 * one it came from — the same rule the phone applies (apps/mobile/src/discover/sections.ts).
 */
export function fullOrder(sections: readonly string[], order: readonly string[], splitFrom: Split = {}): string[] {
  const known = [...new Set(order.filter((s) => sections.includes(s)))];
  for (const [child, [parent]] of Object.entries(splitFrom)) {
    if (!sections.includes(child) || known.includes(child)) continue;
    const at = known.indexOf(parent);
    if (at >= 0) known.splice(at + 1, 0, child);
  }
  return [...known, ...sections.filter((s) => !known.includes(s))];
}

/** M25 A5: an older save that hid a bundle hides the parts split from it too (where the phone did). */
export function fullHidden(hidden: readonly string[], order: readonly string[], splitFrom: Split = {}): string[] {
  const out = [...hidden];
  for (const [child, [parent, withParent]] of Object.entries(splitFrom)) {
    if (withParent && hidden.includes(parent) && !order.includes(child) && !out.includes(child)) out.push(child);
  }
  return out;
}

/**
 * M15 T036 (FR-026–FR-029): Discover's sections (show/hide, order). M25: pins and hides on the
 * chart and on category pages moved to Admin › Lists, with every other list.
 */
export function DiscoverControl() {
  return (
    <>
      <PageHead title="Discover" sub="What the phone's Discover shows, and in which order. Changes apply on the next refresh." />
      <Sections />
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Pins and hides</h2>
        <p className="muted">Pin or hide shows and episodes on the charts, Popular shows, Premium picks, category pages and every other list in <Link to="/admin/lists">Lists</Link>.</p>
      </section>
    </>
  );
}

function Sections() {
  const [n, setN] = useState(0);
  const loaded = useLoad(() => api<Settings>('/v1/admin/discover'), [n]);
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDirty(dirty);
  const data = loaded.state === 'ready' ? loaded.data : null;
  useEffect(() => {
    if (!data) return;
    setOrder(fullOrder(data.sections, data.order, data.splitFrom)); setHidden(fullHidden(data.hidden, data.order, data.splitFrom)); setVersion(data.version); setDirty(false);
  }, [data]);
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ version: number }>('/v1/admin/discover', { method: 'PUT', body: { version, order, hidden } });
      setVersion(r.version); setDirty(false);
    } catch (e) { setError(isChanged(e) ? CHANGED_MESSAGE : errorText(e)); } finally { setBusy(false); }
  };
  if (loaded.state === 'loading') return <section className="card"><Loading /></section>;
  if (loaded.state === 'error') return <section className="card"><Failed message={loaded.message} retry={loaded.retry} /></section>;
  return (
    <section className="card" aria-labelledby="ds-h">
      <h2 id="ds-h">Sections</h2>
      {error ? <p className="error" role="alert">{error}{error === CHANGED_MESSAGE ? <> <button type="button" className="linkish" onClick={() => setN((x) => x + 1)}>Reload</button></> : null}</p> : null}
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
      <div className="savebar" role="region" aria-label="Save Discover">
        <span className="muted">{dirty ? 'You have unsaved changes.' : 'Saved.'}</span>
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => { void save(); }}>{busy ? 'Saving…' : 'Save Discover'}</button>
      </div>
    </section>
  );
}
