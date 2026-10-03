// Shared Admin helpers: error text, an episode search box, and reorder buttons.
import { useState } from 'react';
import { api, HttpError } from '../../api';

/** M15 — what the Admin pages share: error text, an episode finder, an episode card shape. */

export type EpisodeCard = { id?: string; feedUrl: string; guid: string; title: string; showTitle: string; imageUrl?: string };
export type ShowCard = { feedUrl: string; title: string; author: string; imageUrl?: string };

export const errorText = (e: unknown): string => (e instanceof HttpError ? e.message : 'That did not work. Try again.');
export const isChanged = (e: unknown): boolean => e instanceof HttpError && e.code === 'changed';
export const CHANGED_MESSAGE = 'Changed elsewhere — reload.';

/** YYYY-MM-DD in UTC — the day boundary the server and the phone use for picks (research R3). */
export const utcDay = (d = new Date()): string => d.toISOString().slice(0, 10);

/**
 * Find an episode (or a show) with the app's own catalogue search (`GET /v1/search`, FR-007).
 * `kind="show"` lists shows; the default lists episodes.
 */
export function Finder({ label, kind = 'episode', onPick }: { label: string; kind?: 'episode' | 'show'; onPick: (x: EpisodeCard | ShowCard) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<(EpisodeCard | ShowCard)[] | null>(null);
  const id = `find-${label.replace(/\W+/g, '-').toLowerCase()}`;
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ shows: ShowCard[]; episodes: EpisodeCard[] }>(`/v1/search?q=${encodeURIComponent(q.trim())}`);
      setResults(kind === 'show' ? r.shows : r.episodes);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="finder">
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <label className="sr-only" htmlFor={id}>{label}</label>
        <input id={id} type="search" placeholder={label} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn btn-quiet" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {results ? (
        results.length === 0 ? <p className="muted">Nothing found.</p> : (
          <ul className="rows" aria-label="Search results">
            {results.slice(0, 10).map((r) => {
              return (
                <li key={'guid' in r ? `${r.feedUrl}|${r.guid}` : r.feedUrl}>
                  <div className="mini-show">
                    {r.imageUrl ? <img src={r.imageUrl} alt="" /> : <div className="ph" aria-hidden="true" />}
                    <div className="row-main">
                      <div className="row-title">{r.title}</div>
                      <div className="row-sub">{'guid' in r ? r.showTitle : r.author}</div>
                    </div>
                  </div>
                  <button type="button" className="btn btn-quiet" onClick={() => { onPick(r); setResults(null); setQ(''); }}>
                    Add<span className="sr-only"> {r.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

/** Move item `i` by `d` (−1 up, +1 down) — the keyboard way to reorder. */
export function move<T>(list: readonly T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** Up / Down buttons with names a screen reader can say. */
export function Reorder({ i, n, name, onMove }: { i: number; n: number; name: string; onMove: (d: -1 | 1) => void }) {
  return (
    <span className="reorder">
      <button type="button" className="btn btn-quiet" disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Move ${name} up`}>↑</button>
      <button type="button" className="btn btn-quiet" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={`Move ${name} down`}>↓</button>
    </span>
  );
}
