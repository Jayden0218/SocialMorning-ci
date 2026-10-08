// One episode's page: its numbers, reaction curve, retention, comments, comment setting, edit, hide and take-down.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { api, HttpError, type Show } from '../api';
import { HeatCurve, MinuteBars } from '../charts/HeatCurve';
import { RetentionChart } from '../charts/Retention';
import { mmss, num, pct, shortDate } from '../format';
import { PageHead } from '../shell/Page';
import { StatCard } from '../shell/StatCard';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';
import { CommentList, MODES, type CommentMode, type CommentPolicy } from './Comments';
import { EditEpisodeForm, PreviewEditor, type Hosted } from './HostedEdit';
import type { EpisodeRow } from './types';

type Detail = { episode: EpisodeRow & { durationMs: number | null }; heat: number[]; commentsByMinute: { minute: number; count: number }[];
  /** M19 US12: share (0–1) of starters still listening, one per minute; people listening right now. */
  retention?: number[]; listeningNow?: number };

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
        action={show.hosted ? <DeleteEpisode show={show} episodeId={id} /> : <HideEpisode show={show} episodeId={id} />} />
      <section className="stats" aria-label="This episode">
        <StatCard label="Plays" value={num(e.plays)} />
        <StatCard label="Completion" value={pct(e.completionRate)} />
        <StatCard label="Comments" value={num(e.comments)} />
        <StatCard label="Likes" value={num(e.likes)} />
        <StatCard label="Listening now" value={num(d.data.listeningNow ?? 0)} />
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
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="ret-h">
        <h2 id="ret-h">Retention</h2>
        {(d.data.retention ?? []).length === 0
          ? <Empty title="No retention yet">When listeners play this episode, the share still listening at each minute appears here.</Empty>
          : <RetentionChart retention={d.data.retention ?? []} />}
      </section>
      {show.hosted ? <HostedEpisodeEdit show={show} episodeId={id} /> : null}
      <section className="card" style={{ marginTop: 16 }} aria-labelledby="ec-h">
        <h2 id="ec-h">Comments on this episode</h2>
        <EpisodeCommentMode show={show} episodeId={id} />
        <CommentList show={show} episodeId={id} />
      </section>
    </>
  );
}

/** M24 US8: this episode's own comment setting, or "Follow the show". Saved at once. */
function EpisodeCommentMode({ show, episodeId }: { show: Show; episodeId: string }) {
  const p = useLoad(() => api<CommentPolicy>(`/v1/studio/shows/${show.key}/comment-policy`), [show.key]);
  const [policy, setPolicy] = useState<CommentPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (p.state === 'ready') setPolicy(p.data); }, [p.state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (p.state === 'error') return <p className="error" role="alert">The comment setting did not load: {p.message}</p>;
  if (!policy) return <Loading lines={1} label="Comment setting" />;
  const own = policy.episodes.find((x) => x.episodeId === episodeId)?.mode ?? null;
  const label = (m: CommentMode) => MODES.find((x) => x.value === m)?.label ?? m;
  const save = async (v: string) => {
    const mode = v === '' ? null : (v as CommentMode);
    setBusy(true); setMsg(null);
    try {
      const r = await api<CommentPolicy>(`/v1/studio/shows/${show.key}/comment-policy`, { method: 'PUT', body: { episodeId, mode } });
      setPolicy(r);
      setMsg({ ok: true, text: mode ? `Saved: comments on this episode are ${label(mode).toLowerCase()}.` : 'Saved: this episode follows the show.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  return (
    <div className="field">
      <label htmlFor="ep-cmode">Who may comment on this episode</label>
      <select id="ep-cmode" className="select" value={own ?? ''} disabled={busy} onChange={(ev) => { void save(ev.target.value); }}>
        <option value="">Follow the show ({label(policy.show)})</option>
        {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      {msg ? <span className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
      {(own ?? policy.show) === 'review' ? <span className="muted" style={{ fontSize: 13 }}>New comments wait under <Link to={`/s/${show.key}/comments/pending`}>Comments › Pending</Link>.</span> : null}
    </div>
  );
}

/** M24 US11: a claimed show can hide one episode from listeners (lists, search, recommendations). Undo any time. */
function HideEpisode({ show, episodeId }: { show: Show; episodeId: string }) {
  const h = useLoad(() => api<{ items: { episodeId: string }[] }>(`/v1/studio/shows/${show.key}/hidden-episodes`), [show.key]);
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (h.state === 'ready') setHidden(h.data.items.some((x) => x.episodeId === episodeId)); }, [h.state, episodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (hidden === null) return null;
  const put = async (next: boolean) => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ hidden: boolean }>(`/v1/studio/shows/${show.key}/episodes/${encodeURIComponent(episodeId)}/hidden`, { method: 'PUT', body: { hidden: next } });
      setHidden(r.hidden);
    } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); setAsk(false); }
  };
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {hidden ? <span className="pill pill-warn">Hidden</span> : null}
      {hidden
        ? <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => { void put(false); }}>Show to listeners</button>
        : <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setAsk(true)}>Hide from listeners</button>}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {ask ? (
        <ConfirmDialog title="Hide this episode?" body="Listeners will no longer find it in the app's lists, search or recommendations. Comments are kept. You can undo this."
          confirm="Hide episode" busy={busy} onCancel={() => setAsk(false)} onConfirm={() => { void put(true); }} />
      ) : null}
    </div>
  );
}

/** M24 US14 (and US13 for a paid one): edit an episode made here, from its own page. */
function HostedEpisodeEdit({ show, episodeId }: { show: Show; episodeId: string }) {
  const list = useLoad(() => api<{ items: Hosted[] }>(`/v1/studio/shows/${show.key}/hosted-episodes`), [show.key]);
  if (list.state !== 'ready') return null;
  const mine = list.data.items.find((i) => i.episodeId === episodeId);
  if (!mine) return null;
  return (
    <section className="card" style={{ marginTop: 16 }} aria-labelledby="he-h">
      <h2 id="he-h">Edit</h2>
      <EditEpisodeForm key={mine.id} show={show} ep={mine} />
      {mine.paid && show.role === 'owner' ? (
        <>
          <h3 style={{ fontSize: 15, margin: '24px 0 8px' }}>Free preview</h3>
          <PreviewEditor show={show} ep={mine} />
        </>
      ) : null}
    </section>
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
