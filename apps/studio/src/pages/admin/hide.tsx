// Admin parts for hiding a show or an episode from listeners everywhere (no report needed), with a reason.
import { useState } from 'react';
import { api } from '../../api';
import { shortDate } from '../../format';
import { Empty, Failed, Loading } from '../../shell/States';
import { useLoad } from '../../useLoad';
import { errorText, Finder, type EpisodeCard, type ShowCard } from './common';

type HiddenShow = { feedUrl: string; title: string | null; reason: string | null; hiddenAt: string; byReport: boolean };
type HiddenEpisode = { feedUrl: string; guid: string; title: string | null; showTitle: string | null; reason: string | null; hiddenAt: string };
type Hidden = { shows: HiddenShow[]; episodes: HiddenEpisode[] };

/** POST /v1/admin/hidden/{show|episode} — the server goes through the same paths a report action and a host's hide use (M25 A3). */
export const hideEverywhere = (x: { feedUrl: string; guid?: string }, reason: string) =>
  api<Hidden>(x.guid ? '/v1/admin/hidden/episode' : '/v1/admin/hidden/show', { method: 'POST', body: { ...x, reason } });

/**
 * A "Hide everywhere" button that asks for the reason in place (no dialog). Used on Lists' live
 * rows and on a user's detail (their tips and gifts name shows).
 */
export function HideEverywhere({ feedUrl, guid, name, onDone }: { feedUrl: string; guid?: string; name: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const id = `hide-${(guid ?? feedUrl).replace(/\W+/g, '-').slice(-40)}`;
  if (!open) return <button type="button" className="linkish" onClick={() => setOpen(true)}>{guid ? 'Hide episode everywhere' : 'Hide show everywhere'}<span className="sr-only"> {name}</span></button>;
  return (
    <form className="toolbar" onSubmit={(e) => {
      e.preventDefault();
      setMsg(null);
      hideEverywhere({ feedUrl, ...(guid ? { guid } : {}) }, reason.trim()).then(() => { setOpen(false); setReason(''); onDone?.(); }, (err: unknown) => setMsg(errorText(err)));
    }}>
      <label className="sr-only" htmlFor={id}>Why hide {name}</label>
      <input id={id} placeholder="Why (required)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
      <button type="submit" className="btn btn-quiet" disabled={reason.trim().length === 0}>Hide</button>
      <button type="button" className="linkish" onClick={() => setOpen(false)}>Cancel</button>
      {msg ? <span className="error" role="alert">{msg}</span> : null}
    </form>
  );
}

/** M25 A3: every show and episode hidden from listeners, why, and "Show again"; plus a finder to hide one. */
export function HiddenEverywhere() {
  const [n, setN] = useState(0);
  const h = useLoad(() => api<Hidden>('/v1/admin/hidden'), [n]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ feedUrl: string; guid?: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const reload = () => setN((x) => x + 1);
  const run = (p: Promise<unknown>) => { setError(null); p.then(() => { setPicked(null); setReason(''); reload(); }, (e: unknown) => setError(errorText(e))); };
  const showAgain = (s: HiddenShow) => run(api(`/v1/admin/hidden/show?feedUrl=${encodeURIComponent(s.feedUrl)}`, { method: 'DELETE' }));
  const episodeAgain = (e: HiddenEpisode) => run(api(`/v1/admin/hidden/episode?feedUrl=${encodeURIComponent(e.feedUrl)}&guid=${encodeURIComponent(e.guid)}`, { method: 'DELETE' }));
  return (
    <section className="card" aria-labelledby="hid-h">
      <h2 id="hid-h">Hidden from listeners everywhere</h2>
      <p className="muted">A hidden show or episode leaves Discover, every chart, search, For You, next up and category pages. Listeners who already follow a show keep it in their library.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {picked ? (
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); run(hideEverywhere({ feedUrl: picked.feedUrl, ...(picked.guid ? { guid: picked.guid } : {}) }, reason.trim())); }}>
          <span className="row-main">{picked.label}</span>
          <label className="sr-only" htmlFor="hid-reason">Why</label>
          <input id="hid-reason" placeholder="Why (required)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          <button type="submit" className="btn" disabled={reason.trim().length === 0}>Hide everywhere</button>
          <button type="button" className="linkish" onClick={() => setPicked(null)}>Cancel</button>
        </form>
      ) : (
        <>
          <Finder label="Find a show to hide" kind="show" onPick={(x) => setPicked({ feedUrl: x.feedUrl, label: (x as ShowCard).title })} />
          <Finder label="Find an episode to hide" onPick={(x) => setPicked({ feedUrl: x.feedUrl, guid: (x as EpisodeCard).guid, label: `${x.title} — ${(x as EpisodeCard).showTitle}` })} />
        </>
      )}
      {h.state === 'loading' ? <Loading lines={2} label="Hidden" /> : null}
      {h.state === 'error' ? <Failed message={h.message} retry={h.retry} /> : null}
      {h.state === 'ready' ? (
        h.data.shows.length + h.data.episodes.length === 0 ? <Empty title="Nothing hidden" /> : (
          <ul className="rows" aria-label="Hidden shows and episodes">
            {h.data.shows.map((s) => (
              <li key={`s|${s.feedUrl}`}>
                <div className="row-main">
                  <div className="row-title">Show · {s.title ?? s.feedUrl}</div>
                  <div className="row-sub">{s.reason ?? (s.byReport ? 'From a report' : 'No reason given')} · {shortDate(s.hiddenAt)}</div>
                </div>
                <button type="button" className="btn btn-quiet" onClick={() => showAgain(s)}>Show again<span className="sr-only"> {s.title ?? s.feedUrl}</span></button>
              </li>
            ))}
            {h.data.episodes.map((e) => (
              <li key={`e|${e.feedUrl}|${e.guid}`}>
                <div className="row-main">
                  <div className="row-title">Episode · {e.title ?? e.guid}</div>
                  <div className="row-sub">{e.showTitle ?? e.feedUrl} · {e.reason ?? 'Hidden by its host'} · {shortDate(e.hiddenAt)}</div>
                </div>
                <button type="button" className="btn btn-quiet" onClick={() => episodeAgain(e)}>Show again<span className="sr-only"> {e.title ?? e.guid}</span></button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
