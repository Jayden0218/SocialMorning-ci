import { Link, useParams } from 'react-router';
import { api, type Show } from '../api';
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
      <PageHead title={e.title} sub={`${shortDate(e.publishedAt)}${e.durationMs ? ` · ${mmss(e.durationMs)}` : ''}`} />
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
