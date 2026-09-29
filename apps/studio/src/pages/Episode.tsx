import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { api, HttpError, type Show } from '../api';
import { HeatCurve, MinuteBars } from '../charts/HeatCurve';
import { mmss, num, pct, shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { StatCard } from '../shell/StatCard';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';
import { CommentList } from './Comments';
import type { EpisodeRow } from './types';

type Detail = { episode: EpisodeRow & { durationMs: number | null }; heat: number[]; commentsByMinute: { minute: number; count: number }[] };

/** One episode: its numbers, where listeners react, and its comments (FR-013). */
export function Episode({ show }: { show: Show }) {
  const { id = '' } = useParams();
  const d = useLoad(() => api<Detail>(`/v1/studio/shows/${show.key}/episodes/${encodeURIComponent(id)}`), [show.key, id]);
  if (d.state === 'loading') return <Loading lines={6} label="Episode" />;
  if (d.state === 'error') return <div className="card"><Failed message={d.message} retry={d.retry} /></div>;
  const e = d.data.episode;
  return (
    <>
      <p style={{ margin: '0 0 8px' }}><Link to={`/s/${show.key}/episodes`}>← Episodes</Link></p>
      <PageHead title={e.title} sub={`${shortDate(e.publishedAt)}${e.durationMs ? ` · ${mmss(e.durationMs)}` : ''}`}
        action={show.hosted ? <DeleteEpisode show={show} episodeId={id} /> : undefined} />
      <section className="stats" aria-label="This episode">
        <StatCard label="Plays" value={num(e.plays)} />
        <StatCard label="Completion" value={pct(e.completionRate)} />
        <StatCard label="Comments" value={num(e.comments)} />
        <StatCard label="Likes" value={num(e.likes)} />
      </section>
      <div className="grid-2" style={{ marginTop: 0 }}>
        <section className="card" aria-labelledby="heat-h">
          <h2 id="heat-h">Where listeners react</h2>
          <HeatCurve heat={d.data.heat} durationMs={e.durationMs} />
        </section>
        <section className="card" aria-labelledby="cpm-h">
          <h2 id="cpm-h">Comments by minute</h2>
          {d.data.commentsByMinute.length === 0 ? <Empty title="No timed comments yet" /> : <MinuteBars items={d.data.commentsByMinute} />}
        </section>
      </div>
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="ec-h">
        <h2 id="ec-h">Comments on this episode</h2>
        <CommentList show={show} episodeId={id} />
      </section>
    </>
  );
}

/** M13: a hosted episode can be taken down — out of the feed, audio deleted (FR-007). */
function DeleteEpisode({ show, episodeId }: { show: Show; episodeId: string }) {
  const navigate = useNavigate();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true); setError(null);
    try {
      const { items } = await api<{ items: { id: string; episodeId: string }[] }>(`/v1/studio/shows/${show.key}/hosted-episodes`);
      const mine = items.find((i) => i.episodeId === episodeId);
      if (!mine) throw new HttpError(404, 'not_found', 'This episode is not one uploaded here.');
      await api(`/v1/studio/shows/${show.key}/hosted-episodes/${mine.id}`, { method: 'DELETE' });
      navigate(`/s/${show.key}/episodes`, { replace: true });
    } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); setAsk(false); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className="btn btn-quiet" onClick={() => setAsk(true)}>Delete episode</button>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {ask ? <ConfirmDialog title="Delete this episode?" body="It leaves your feed and its audio file is deleted. Comments on it stay in the app. This cannot be undone." confirm="Delete" busy={busy} onCancel={() => setAsk(false)} onConfirm={() => { void remove(); }} /> : null}
    </>
  );
}
