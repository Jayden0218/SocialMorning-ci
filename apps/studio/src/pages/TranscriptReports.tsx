// Page listing listeners' transcript corrections for a show, each with a Done button.
import { useState } from 'react';
import { Link } from 'react-router';
import { api, HttpError, type Show } from '../api';
import { mmss, shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';

export type TranscriptReport = {
  id: string; episodeId: string; episodeTitle: string; offsetMs: number;
  original: string; suggested: string; createdAt: string; status: 'open' | 'done';
};

/**
 * M21 US2 (spec story 2, scenario 6): a listener long-pressed a transcript line in the app and
 * typed the right words. The host reads what the line says and what it should say, fixes the
 * transcript where it is published, and marks the report done. Open ones come first.
 */
export function TranscriptReports({ show }: { show: Show }) {
  const [n, setN] = useState(0);
  const list = useLoad(() => api<{ items: TranscriptReport[] }>(`/v1/studio/shows/${show.key}/transcript-reports`), [show.key, n]);
  return (
    <>
      <PageHead title="Transcript reports" sub="Listeners' corrections to your transcripts. Fix the line where your transcript is published, then mark it done." />
      <section className="card">
        {list.state === 'loading' ? <Loading lines={4} label="Transcript reports" /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.items.length === 0 ? <Empty title="No transcript reports">When a listener reports a wrong line, it appears here.</Empty> : null}
        {list.state === 'ready' ? list.data.items.map((r) => <ReportItem key={r.id} show={show} r={r} onDone={() => setN((x) => x + 1)} />) : null}
      </section>
    </>
  );
}

function ReportItem({ show, r, onDone }: { show: Show; r: TranscriptReport; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = async () => {
    setBusy(true); setError(null);
    try { await api(`/v1/studio/transcript-reports/${r.id}`, { method: 'PATCH', body: { status: 'done' } }); onDone(); }
    catch (e) { setError(e instanceof HttpError ? e.message : 'That did not save. Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <article className="comment" aria-label={`Transcript report at ${mmss(r.offsetMs)} on ${r.episodeTitle}`}>
      <div className="comment-meta">
        <Link to={`/s/${show.key}/episodes/${r.episodeId}`}>{r.episodeTitle}</Link>
        <span className="num">at {mmss(r.offsetMs)}</span>
        <span>{shortDate(r.createdAt)}</span>
        {r.status === 'done' ? <span className="pill">Done</span> : <span className="pill pill-warn">Open</span>}
      </div>
      <p className="muted" style={{ margin: '6px 0 2px' }}>The transcript says</p>
      <p className="comment-body">{r.original || <i className="muted">(empty)</i>}</p>
      <p className="muted" style={{ margin: '6px 0 2px' }}>It should say</p>
      <p className="comment-body">{r.suggested}</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {r.status === 'open' ? (
        <div className="comment-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => { void done(); }}>
            Done<span className="sr-only"> — the line at {mmss(r.offsetMs)} on {r.episodeTitle}</span>
          </button>
        </div>
      ) : null}
    </article>
  );
}
