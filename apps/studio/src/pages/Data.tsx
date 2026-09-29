import { useState } from 'react';
import { Link } from 'react-router';
import { api, downloadCsv, HttpError, type Show } from '../api';
import { TrendChart, type Point } from '../charts/TrendChart';
import { browserTz, num, pct, shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { StatCard } from '../shell/StatCard';
import { Empty, Failed, Loading } from '../shell/States';
import { Pager, Table, type Column } from '../shell/Table';
import { useLoad } from '../useLoad';
import type { EpisodePage, EpisodeRow } from './types';

const METRICS = [
  { key: 'plays', label: 'Plays' }, { key: 'subs', label: 'Subscribers' }, { key: 'comments', label: 'Comments' },
  { key: 'saves', label: 'Saves' }, { key: 'shares', label: 'Shares' }, { key: 'likes', label: 'Likes' },
] as const;

/** US2 — the numbers a creator studies and takes away (FR-008, FR-009, FR-010). */
export function Data({ show }: { show: Show }) {
  const base = `/v1/studio/shows/${show.key}`;
  const tz = browserTz();
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('plays');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [sort, setSort] = useState('publishedAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState<string | null>(null);

  const y = useLoad(() => api<{ plays: number; subs: number; comments: number; shares: number }>(`${base}/yesterday?tz=${encodeURIComponent(tz)}`), [base]);
  const trend = useLoad(() => api<{ days: Point[] }>(`${base}/trend?metric=${metric}&days=${days}&tz=${encodeURIComponent(tz)}`), [base, metric, days]);
  const top = useLoad(() => api<{ items: { id: string; title: string; plays: number }[] }>(`${base}/top-episodes`), [base]);
  const also = useLoad(() => api<{ hidden: 'too_few' } | { shows: { feedUrl: string; title: string | null; image: string | null; listeners: number }[] }>(`${base}/also-follow`), [base]);
  const table = useLoad(() => api<EpisodePage>(`${base}/episodes?sort=${sort}&dir=${dir}&page=${page}`), [base, sort, dir, page]);

  const exportCsv = (path: string, name: string) => {
    setExportError(null);
    downloadCsv(`${base}${path}`, name).catch((e: unknown) => setExportError(e instanceof HttpError ? e.message : 'The export did not work.'));
  };
  const onSort = (k: string) => {
    if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(k); setDir(k === 'title' ? 'asc' : 'desc'); }
    setPage(1);
  };
  const cols: Column<EpisodeRow>[] = [
    { key: 'title', label: 'Episode', sortable: true, render: (e) => <Link to={`/s/${show.key}/episodes/${e.id}`}>{e.title}</Link> },
    { key: 'publishedAt', label: 'Published', sortable: true, render: (e) => shortDate(e.publishedAt) },
    { key: 'plays', label: 'Plays', numeric: true, sortable: true, render: (e) => num(e.plays) },
    { key: 'completionRate', label: 'Completion', numeric: true, sortable: true, render: (e) => pct(e.completionRate) },
    { key: 'comments', label: 'Comments', numeric: true, sortable: true, render: (e) => num(e.comments) },
    { key: 'shares', label: 'Shares', numeric: true, sortable: true, render: (e) => num(e.shares) },
    { key: 'saves', label: 'Saves', numeric: true, sortable: true, render: (e) => num(e.saves) },
    { key: 'likes', label: 'Likes', numeric: true, sortable: true, render: (e) => num(e.likes) },
  ];
  const yd = y.state === 'ready' ? y.data : null;
  const label = METRICS.find((m) => m.key === metric)!.label;

  return (
    <>
      <PageHead title="Data" sub="What happened, and what to take away." />
      {exportError ? <p className="error" role="alert">{exportError}</p> : null}
      {y.state === 'error' ? <div className="card" style={{ marginBottom: 16 }}><Failed message={y.message} retry={y.retry} /></div> : (
        <section className="stats" aria-label="Yesterday">
          <StatCard label="New plays yesterday" value={yd && num(yd.plays)} />
          <StatCard label="New subscribers yesterday" value={yd && num(yd.subs)} />
          <StatCard label="New comments yesterday" value={yd && num(yd.comments)} />
          <StatCard label="Shares yesterday" value={yd && num(yd.shares)} />
        </section>
      )}

      <section className="card" aria-labelledby="dt-h">
        <div className="card-head">
          <h2 id="dt-h">Trend</h2>
          <div className="toolbar" style={{ margin: 0 }}>
            <label className="sr-only" htmlFor="range">Range</label>
            <select id="range" className="select" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)}>
              <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
            </select>
            <button type="button" className="btn btn-quiet" onClick={() => exportCsv(`/export/trend.csv?metric=${metric}&days=${days}&tz=${encodeURIComponent(tz)}`, `${metric}.csv`)}>Export CSV</button>
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Measure" style={{ marginBottom: 12 }}>
          {METRICS.map((m) => <button key={m.key} type="button" role="tab" className="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}
        </div>
        {trend.state === 'loading' ? <Loading lines={5} label="Chart" /> : null}
        {trend.state === 'error' ? <Failed message={trend.message} retry={trend.retry} /> : null}
        {trend.state === 'ready' ? <><TrendChart points={trend.data.days} label={label} /><p className="chart-note">Days in {tz}.</p></> : null}
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="top-h">
          <h2 id="top-h">Most played</h2>
          {top.state === 'loading' ? <Loading /> : null}
          {top.state === 'error' ? <Failed message={top.message} retry={top.retry} /> : null}
          {top.state === 'ready' && top.data.items.length === 0 ? <Empty title="No plays yet" /> : null}
          {top.state === 'ready' && top.data.items.length > 0 ? (
            <div className="bars">
              {top.data.items.map((e) => (
                <div key={e.id} className="bar-row">
                  <Link to={`/s/${show.key}/episodes/${e.id}`} className="row-title">{e.title}</Link>
                  <span className="num muted">{num(e.plays)}</span>
                  <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${(e.plays / top.data.items[0]!.plays) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        <section className="card" aria-labelledby="also-h">
          <h2 id="also-h">Your listeners also follow</h2>
          {also.state === 'loading' ? <Loading /> : null}
          {also.state === 'error' ? <Failed message={also.message} retry={also.retry} /> : null}
          {also.state === 'ready' && 'hidden' in also.data ? <Empty title="Not enough listeners yet">This appears once 5 people subscribe, so no one can be picked out.</Empty> : null}
          {also.state === 'ready' && 'shows' in also.data ? (
            also.data.shows.length === 0 ? <Empty title="Nothing in common yet" /> : (
              <div className="shows-grid">
                {also.data.shows.map((s) => (
                  <div key={s.feedUrl} className="mini-show">
                    {s.image ? <img src={s.image} alt="" /> : <div className="ph" aria-hidden="true" />}
                    <div><div className="row-title">{s.title ?? s.feedUrl}</div><div className="row-sub">{num(s.listeners)} of your subscribers</div></div>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }} aria-labelledby="eps-h">
        <div className="card-head">
          <h2 id="eps-h">Every episode</h2>
          <button type="button" className="btn btn-quiet" onClick={() => exportCsv('/export/episodes.csv', 'episodes.csv')}>Export CSV</button>
        </div>
        {table.state === 'loading' ? <Loading lines={6} /> : null}
        {table.state === 'error' ? <Failed message={table.message} retry={table.retry} /> : null}
        {table.state === 'ready' && table.data.total === 0 ? <Empty title="No episodes seen yet">Episodes appear once a listener opens your show in the app.</Empty> : null}
        {table.state === 'ready' && table.data.total > 0 ? (
          <>
            <Table caption="Every episode's numbers" columns={cols} rows={table.data.items} rowKey={(e) => e.id} sort={sort} dir={dir} onSort={onSort} />
            <Pager page={page} total={table.data.total} pageSize={table.data.pageSize} onPage={setPage} />
          </>
        ) : null}
      </section>
    </>
  );
}
