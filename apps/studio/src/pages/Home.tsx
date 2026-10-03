// The Studio home page: totals, a trend chart and the latest activity.
import { useState } from 'react';
import { Link } from 'react-router';
import { api, type Show } from '../api';
import { TrendChart, type Point } from '../charts/TrendChart';
import { browserTz, dayNumber, mmss, num, pct, shortDate } from '../format';
import { StatCard } from '../shell/StatCard';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';

export type Totals = { plays: number; completionRate: number | null; subscribers: number; comments: number; likes: number; clips: number; saves: number; shares: number };
export type Overview = {
  claimedAt: string | null;
  totals: Totals;
  recentComments: { id: string; episodeTitle: string; author: string | null; body: string; offsetMs: number | null; createdAt: string }[];
  recentEpisodes: { id: string; title: string; publishedAt: string | null; plays: number; comments: number }[];
  /** M14 US6 (FR-07): 14 daily points per measure, oldest first — the same numbers as the trend. */
  sparklines?: Partial<Record<'plays' | 'subs' | 'comments' | 'saves' | 'shares' | 'likes', number[]>>;
};

const METRICS = [
  { key: 'plays', label: 'Plays' },
  { key: 'subs', label: 'Subscribers' },
  { key: 'comments', label: 'Comments' },
  { key: 'saves', label: 'Saves' },
  { key: 'shares', label: 'Shares' },
  { key: 'likes', label: 'Likes' },
] as const;
type MetricKey = (typeof METRICS)[number]['key'];

export function Home({ show }: { show: Show }) {
  const tz = browserTz();
  const overview = useLoad(() => api<Overview>(`/v1/studio/shows/${show.key}/overview?tz=${encodeURIComponent(tz)}`), [show.key]);
  const [metric, setMetric] = useState<MetricKey>('plays');
  const sp = overview.state === 'ready' ? overview.data.sparklines ?? {} : {};
  const trend = useLoad(
    () => api<{ days: Point[] }>(`/v1/studio/shows/${show.key}/trend?metric=${metric}&days=30&tz=${encodeURIComponent(tz)}`),
    [show.key, metric],
  );
  const t = overview.state === 'ready' ? overview.data.totals : null;
  const n = overview.state === 'ready' ? dayNumber(overview.data.claimedAt) : null;
  const metricLabel = METRICS.find((m) => m.key === metric)!.label;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{n ? `Day ${num(n)} with ${show.title ?? 'your show'}` : 'Hello'}</h1>
          <p>How {show.title ?? 'your show'} is doing, all time.</p>
        </div>
      </header>

      {overview.state === 'error' ? (
        <div className="card" style={{ marginBottom: 16 }}><Failed message={overview.message} retry={overview.retry} /></div>
      ) : (
        <section className="stats" aria-label="Totals">
          <StatCard label="Plays" spark={sp.plays} value={t && num(t.plays)} note="One listener, one episode, one day" />
          <StatCard label="Completion" value={t && pct(t.completionRate)} note={t && t.completionRate === null ? 'Needs episode lengths' : 'Heard 90 % or more'} />
          <StatCard label="Subscribers" spark={sp.subs} value={t && num(t.subscribers)} />
          <StatCard label="Comments" spark={sp.comments} value={t && num(t.comments)} />
          <StatCard label="Likes" spark={sp.likes} value={t && num(t.likes)} note="Listeners who reacted" />
          <StatCard label="Clips" value={t && num(t.clips)} />
          <StatCard label="Saves" spark={sp.saves} value={t && num(t.saves)} />
          <StatCard label="Shares" spark={sp.shares} value={t && num(t.shares)} />
        </section>
      )}

      <section className="card" aria-labelledby="trend-h">
        <div className="card-head">
          <h2 id="trend-h">Last 30 days</h2>
          <div className="tabs" role="tablist" aria-label="Measure">
            {METRICS.map((m) => (
              <button key={m.key} type="button" role="tab" className="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>
            ))}
          </div>
        </div>
        {trend.state === 'loading' ? <Loading lines={5} label="Chart" /> : null}
        {trend.state === 'error' ? <Failed message={trend.message} retry={trend.retry} /> : null}
        {trend.state === 'ready' ? (
          <>
            <TrendChart points={trend.data.days} label={metricLabel} />
            <p className="chart-note">Days in {tz}. {metric === 'plays' ? 'Plays are counted on the listener’s own day.' : ''}</p>
          </>
        ) : null}
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="rc-h">
          <div className="card-head"><h2 id="rc-h">Latest comments</h2><Link to={`/s/${show.key}/comments`}>See all</Link></div>
          {overview.state === 'loading' ? <Loading /> : null}
          {overview.state === 'error' ? <Failed message={overview.message} retry={overview.retry} /> : null}
          {overview.state === 'ready' && overview.data.recentComments.length === 0 ? (
            <Empty title="No comments yet">When listeners comment on an episode, the newest appear here.</Empty>
          ) : null}
          {overview.state === 'ready' && overview.data.recentComments.length > 0 ? (
            <ul className="rows">
              {overview.data.recentComments.map((c) => (
                <li key={c.id}>
                  <div className="row-main">
                    <div className="row-sub">{c.author ?? 'Deleted account'} · {c.episodeTitle}{c.offsetMs !== null ? ` · at ${mmss(c.offsetMs)}` : ''}</div>
                    <p className="row-body">{c.body}</p>
                  </div>
                  <span className="row-side">{shortDate(c.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <section className="card" aria-labelledby="re-h">
          <div className="card-head"><h2 id="re-h">Latest episodes</h2><Link to={`/s/${show.key}/episodes`}>See all</Link></div>
          {overview.state === 'loading' ? <Loading /> : null}
          {overview.state === 'error' ? <Failed message={overview.message} retry={overview.retry} /> : null}
          {overview.state === 'ready' && overview.data.recentEpisodes.length === 0 ? (
            <Empty title="No episodes seen yet">Episodes appear once a listener opens your show in the app.</Empty>
          ) : null}
          {overview.state === 'ready' && overview.data.recentEpisodes.length > 0 ? (
            <ul className="rows">
              {overview.data.recentEpisodes.map((e) => (
                <li key={e.id}>
                  <div className="row-main">
                    <div className="row-title">{e.title}</div>
                    <div className="row-sub">{shortDate(e.publishedAt)}</div>
                  </div>
                  <span className="row-side num">{num(e.plays)} play{e.plays === 1 ? '' : 's'} · {num(e.comments)} comment{e.comments === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </>
  );
}
