// Page listing every episode of the show with its numbers.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type Show } from '../api';
import { num, shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { Pager, Table, type Column } from '../shell/Table';
import { useLoad } from '../useLoad';
import type { EpisodePage, EpisodeRow } from './types';
import { Pending } from './Pending';
import { move, Reorder } from './admin/common';
import { HOST_PICKS_MAX, noun } from '@socialmorning/social-core';

type Pick = { id: string; title: string };

/**
 * M21 US5 (FR-042): Host picks — up to 20 episodes the host stars here, in the order set here;
 * the app's show page lists them under its "Host picks" chip. Every change is saved at once
 * (PUT replaces the list). If the list cannot be read the star column and the card stay hidden.
 */
function useHostPicks(show: Show) {
  const [picks, setPicks] = useState<Pick[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    api<{ items: Pick[] }>(`/v1/studio/shows/${show.key}/host-picks`).then((r) => { if (live) setPicks(r.items); }, () => undefined);
    return () => { live = false; };
  }, [show.key]);
  const save = (next: Pick[]) => {
    const before = picks;
    setPicks(next);
    setError(undefined);
    api<{ items: Pick[] }>(`/v1/studio/shows/${show.key}/host-picks`, { method: 'PUT', body: { episodeIds: next.map((p) => p.id) } })
      .then((r) => setPicks(r.items), (e: unknown) => { setPicks(before); setError(e instanceof Error ? e.message : 'Could not save the host picks.'); });
  };
  const toggle = (e: { id: string; title: string }) => {
    if (!picks) return;
    if (picks.some((p) => p.id === e.id)) { save(picks.filter((p) => p.id !== e.id)); return; }
    if (picks.length >= HOST_PICKS_MAX) { setError(`At most ${HOST_PICKS_MAX} host picks. Remove one first.`); return; }
    save([...picks, { id: e.id, title: e.title }]);
  };
  return { picks, error, save, toggle };
}

/** M24 US11: the episodes a claimed show hid from listeners, read once, for the "Hidden" mark. Unreadable = no marks. */
function useHidden(show: Show): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (show.hosted) return;
    let live = true;
    api<{ items: { episodeId: string }[] }>(`/v1/studio/shows/${show.key}/hidden-episodes`)
      .then((r) => { if (live) setIds(new Set(r.items.map((i) => i.episodeId))); }, () => undefined);
    return () => { live = false; };
  }, [show.key, show.hosted]);
  return ids;
}

function HostPicksCard({ picks, error, save }: { picks: Pick[]; error: string | undefined; save: (next: Pick[]) => void }) {
  return (
    <section className="card" aria-labelledby="host-picks-h">
      <h2 id="host-picks-h" style={{ marginTop: 0 }}>Host picks</h2>
      <p className="muted">Star up to {HOST_PICKS_MAX} episodes below. Listeners see them, in this order, under "Host picks" on your show page in the app.</p>
      {error ? <p role="alert">{error}</p> : null}
      {picks.length === 0 ? <p className="muted">No host picks yet.</p> : (
        <ol className="phone-picks">
          {picks.map((p, i) => (
            <li key={p.id} className="pick-actions">
              <span style={{ flex: 1 }}>{p.title}</span>
              <Reorder i={i} n={picks.length} name={p.title} onMove={(d) => save(move(picks, i, d))} />
              <button type="button" className="btn btn-quiet" onClick={() => save(picks.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.title} from host picks`}>Remove</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** US3 — every episode of the feed (FR-013). New episodes come from the creator's own feed. M21: the Host picks star and card. */
export function Episodes({ show }: { show: Show }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [bump, setBump] = useState(0);
  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const hostPicks = useHostPicks(show);
  const hidden = useHidden(show);
  const list = useLoad(() => api<EpisodePage>(`/v1/studio/shows/${show.key}/episodes?page=${page}&q=${encodeURIComponent(query)}`), [show.key, page, query, bump]);
  const picked = new Set((hostPicks.picks ?? []).map((p) => p.id));
  const cols: Column<EpisodeRow>[] = [
    ...(hostPicks.picks ? [{
      key: 'pick', label: 'Host pick',
      render: (e: EpisodeRow) => (
        <button type="button" className="linkish" aria-pressed={picked.has(e.id)} aria-label={picked.has(e.id) ? `Remove ${e.title} from host picks` : `Add ${e.title} to host picks`} onClick={() => hostPicks.toggle(e)}>
          {picked.has(e.id) ? '★' : '☆'}
        </button>
      ),
    } as Column<EpisodeRow>] : []),
    { key: 'title', label: 'Episode', render: (e) => <><Link to={`/s/${show.key}/episodes/${e.id}`}>{e.title}</Link>{hidden.has(e.id) ? <> <span className="pill pill-warn">Hidden</span></> : null}</> },
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
      {show.hosted ? <Pending show={show} onChange={() => setBump((x) => x + 1)} /> : null}
      {hostPicks.picks ? <HostPicksCard picks={hostPicks.picks} error={hostPicks.error} save={hostPicks.save} /> : null}
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
            <p className="muted" style={{ marginTop: 0 }}>{num(list.data.total)} {noun(list.data.total, 'episode')}</p>
            <Table caption="Episodes" columns={cols} rows={list.data.items} rowKey={(e) => e.id} />
            <Pager page={page} total={list.data.total} pageSize={list.data.pageSize} onPage={setPage} />
          </>
        ) : null}
      </section>
    </>
  );
}
