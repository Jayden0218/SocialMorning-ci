import { useState } from 'react';
import { api, HttpError, type Show } from '../api';
import { num, shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';
import type { EpisodePage } from './types';

type Poll = { id: string; question: string; episodeId: string | null; endsAt: string; closedAt: string | null; open: boolean; total: number; options: { idx: number; label: string; votes: number }[] };

const inDays = (d: number) => {
  const t = new Date(Date.now() + d * 86_400_000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/** US5 — ask listeners (FR-022, FR-023). */
export function Polls({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const polls = useLoad(() => api<{ items: Poll[] }>(`/v1/studio/shows/${show.key}/polls`), [show.key, n]);
  const eps = useLoad(() => api<EpisodePage>(`/v1/studio/shows/${show.key}/episodes?page=1`), [show.key]);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [ends, setEnds] = useState(inDays(7));
  const [episodeId, setEpisodeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<Poll | null>(null);
  const create = async () => {
    setBusy(true); setError(null);
    try {
      await api(`/v1/studio/shows/${show.key}/polls`, { method: 'POST', body: {
        question, options: options.map((o) => o.trim()).filter(Boolean), endsAt: new Date(`${ends}T23:59:00`).toISOString(), ...(episodeId ? { episodeId } : {}),
      } });
      setQuestion(''); setOptions(['', '']); setEpisodeId(''); setN((x) => x + 1);
    } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title="Polls" sub="Listeners vote once in the app; you see the count as it happens." />
      <section className="card" aria-labelledby="np-h">
        <h2 id="np-h">New poll</h2>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div className="field"><label htmlFor="pq">Question</label><input id="pq" maxLength={100} required value={question} onChange={(e) => setQuestion(e.target.value)} /></div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
            <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Options (2 to 6)</legend>
            {options.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <label className="sr-only" htmlFor={`po${i}`}>Option {i + 1}</label>
                <input id={`po${i}`} style={{ flex: 1 }} className="select" maxLength={40} required={i < 2} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
                {options.length > 2 ? <button type="button" className="btn btn-quiet" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}>Remove</button> : null}
              </div>
            ))}
            {options.length < 6 ? <button type="button" className="linkish" onClick={() => setOptions([...options, ''])}>Add an option</button> : null}
          </fieldset>
          <div className="toolbar">
            <div className="field" style={{ margin: 0 }}><label htmlFor="pe">Ends on</label><input id="pe" type="date" className="select" min={inDays(1)} max={inDays(30)} required value={ends} onChange={(e) => setEnds(e.target.value)} /></div>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label htmlFor="pep">Show it on an episode too (optional)</label>
              <select id="pep" className="select" value={episodeId} onChange={(e) => setEpisodeId(e.target.value)}>
                <option value="">Only on the show page</option>
                {eps.state === 'ready' ? eps.data.items.map((e) => <option key={e.id} value={e.id}>{e.title}</option>) : null}
              </select>
            </div>
          </div>
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create poll'}</button>
        </form>
      </section>
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="pp-h">
        <h2 id="pp-h">Your polls</h2>
        {polls.state === 'loading' ? <Loading /> : null}
        {polls.state === 'error' ? <Failed message={polls.message} retry={polls.retry} /> : null}
        {polls.state === 'ready' && polls.data.items.length === 0 ? <Empty title="No polls yet" /> : null}
        {polls.state === 'ready' ? polls.data.items.map((p) => (
          <article key={p.id} className="comment">
            <div className="comment-meta">
              <span className={`pill${p.open ? ' pill-warn' : ''}`}>{p.open ? 'Open' : 'Closed'}</span>
              <span>{p.open ? `Ends ${shortDate(p.endsAt)}` : `Ended ${shortDate(p.closedAt ?? p.endsAt)}`}</span>
              <span className="num">{num(p.total)} vote{p.total === 1 ? '' : 's'}</span>
            </div>
            <h3 style={{ margin: '6px 0 10px', fontSize: 16 }}>{p.question}</h3>
            <div className="bars">
              {p.options.map((o) => {
                const share = p.total ? o.votes / p.total : 0;
                return (
                  <div key={o.idx} className="bar-row">
                    <span>{o.label}</span><span className="num muted">{Math.round(share * 100)}% · {num(o.votes)}</span>
                    <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${share * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
            {p.open ? <div className="comment-actions" style={{ marginTop: 10 }}><button type="button" className="linkish" onClick={() => setClosing(p)}>Close now</button></div> : null}
          </article>
        )) : null}
      </section>
      {closing ? (
        <ConfirmDialog title="Close this poll now?" body="No more votes are taken. Listeners see the result for 7 more days." confirm="Close poll" busy={busy}
          onCancel={() => setClosing(null)}
          onConfirm={() => { setBusy(true); api(`/v1/studio/shows/${show.key}/polls/${closing.id}/close`, { method: 'POST' }).then(() => { setClosing(null); setN((x) => x + 1); }, (e: unknown) => setError(e instanceof HttpError ? e.message : 'That did not work.')).finally(() => setBusy(false)); }} />
      ) : null}
    </>
  );
}
