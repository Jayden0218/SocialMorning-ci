import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type Show } from '../api';
import { num, shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { Pager, Table, type Column } from '../shell/Table';
import { useLoad } from '../useLoad';
import type { EpisodePage, EpisodeRow } from './types';

/** US3 — every episode of the feed (FR-013). New episodes come from the creator's own feed. */
export function Episodes({ show }: { show: Show }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const list = useLoad(() => api<EpisodePage>(`/v1/studio/shows/${show.key}/episodes?page=${page}&q=${encodeURIComponent(query)}`), [show.key, page, query]);
  const cols: Column<EpisodeRow>[] = [
    { key: 'title', label: 'Episode', render: (e) => <Link to={`/s/${show.key}/episodes/${e.id}`}>{e.title}</Link> },
    { key: 'plays', label: 'Plays', numeric: true, render: (e) => num(e.plays) },
    { key: 'comments', label: 'Comments', numeric: true, render: (e) => num(e.comments) },
    { key: 'publishedAt', label: 'Published', numeric: true, render: (e) => shortDate(e.publishedAt) },
  ];
  return (
    <>
      {show.hosted ? (
        <PageHead title="Episodes" sub="Upload and publish episodes here; they go straight into your show's feed."
          action={<Link className="btn" to={`/s/${show.key}/episodes/new`} style={{ textDecoration: 'none' }}>New episode</Link>} />
      ) : (
        <PageHead title="Episodes" sub="From your feed. To publish a new episode, publish it in your feed — it appears here once listeners see it." />
      )}
      <div className="toolbar">
        <label className="sr-only" htmlFor="ep-q">Search episodes</label>
        <input id="ep-q" type="search" placeholder="Search by title" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section className="card">
        {list.state === 'loading' ? <Loading lines={6} /> : null}
        {list.state === 'error' ? <Failed message={list.message} retry={list.retry} /> : null}
        {list.state === 'ready' && list.data.total === 0 ? (
          query ? <Empty title="No episode matches">Try fewer words.</Empty> : <Empty title="No episodes seen yet">Episodes appear once a listener opens your show in the app.</Empty>
        ) : null}
        {list.state === 'ready' && list.data.total > 0 ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>{num(list.data.total)} episode{list.data.total === 1 ? '' : 's'}</p>
            <Table caption="Episodes" columns={cols} rows={list.data.items} rowKey={(e) => e.id} />
            <Pager page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        ) : null}
      </section>
    </>
  );
}
