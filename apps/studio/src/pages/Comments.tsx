import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, HttpError, type Show } from '../api';
import { mmss, shortDate } from '../format';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { MuteDialog } from './Subscribers';
import { PageHead } from '../shell/Page';
import { Empty, Failed, Loading } from '../shell/States';
import { useLoad } from '../useLoad';
import type { EpisodePage } from './types';

export type StudioComment = {
  id: string; episodeId: string; episodeTitle: string; author: { id: string; displayName: string } | null;
  body: string | null; state: 'visible' | 'host_hidden' | 'removed' | 'deleted'; offsetMs: number | null;
  createdAt: string; parentId: string | null; replies: number; byTeam?: boolean;
};

const STATE: Record<StudioComment['state'], string> = { visible: '', host_hidden: 'Hidden by you', removed: 'Removed by moderation', deleted: 'Deleted by its author' };

/** The list itself — also used on one episode's page. */
export function CommentList({ show, episodeId, q = '' }: { show: Show; episodeId?: string; q?: string }) {
  const [extra, setExtra] = useState<StudioComment[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [n, setN] = useState(0);
  const params = `${q ? `q=${encodeURIComponent(q)}&` : ''}${episodeId ? `episodeId=${encodeURIComponent(episodeId)}&` : ''}`;
  const list = useLoad(() => api<{ items: StudioComment[]; next?: string }>(`/v1/studio/shows/${show.key}/comments?${params}`), [show.key, params, n]);
  useEffect(() => { setExtra([]); setNext(list.state === 'ready' ? list.data.next : undefined); }, [list.state === 'ready' ? list.data : null]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = async () => {
    if (!next) return;
    const r = await api<{ items: StudioComment[]; next?: string }>(`/v1/studio/shows/${show.key}/comments?${params}before=${encodeURIComponent(next)}`);
    setExtra((x) => [...x, ...r.items]);
    setNext(r.next);
  };
  if (list.state === 'loading') return <Loading lines={5} label="Comments" />;
  if (list.state === 'error') return <Failed message={list.message} retry={list.retry} />;
  const items = [...list.data.items, ...extra];
  if (items.length === 0) return q ? <Empty title="No comment matches">Try another word.</Empty> : <Empty title="No comments yet">When listeners comment, they appear here, newest first.</Empty>;
  return (
    <div>
      {items.map((c) => <CommentItem key={c.id} show={show} c={c} showEpisode={!episodeId} onChanged={() => setN((x) => x + 1)} />)}
      {next ? <p style={{ textAlign: 'center' }}><button type="button" className="btn btn-quiet" onClick={() => { void more(); }}>Show older</button></p> : null}
    </div>
  );
}

function CommentItem({ show, c, showEpisode, onChanged }: { show: Show; c: StudioComment; showEpisode: boolean; onChanged: () => void }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'hide' | 'unhide' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [muting, setMuting] = useState(false);
  const [muted, setMuted] = useState(false);
  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setError(null);
    try { await fn(); after?.(); } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  };
  const live = c.state === 'visible' || c.state === 'host_hidden';
  return (
    <article className="comment" aria-label={`Comment by ${c.author?.displayName ?? 'unknown'}`}>
      <div className="comment-meta">
        <strong style={{ color: 'var(--text)' }}>{c.author?.displayName ?? '—'}</strong>
        {showEpisode ? <Link to={`/s/${show.key}/episodes/${c.episodeId}`}>{c.episodeTitle}</Link> : null}
        {c.offsetMs !== null ? <span className="num">at {mmss(c.offsetMs)}</span> : null}
        <span>{shortDate(c.createdAt)}</span>
        {c.parentId ? <span className="pill">Reply</span> : null}
        {c.byTeam ? <span className="pill">Your team</span> : null}
        {STATE[c.state] ? <span className={`pill${c.state === 'host_hidden' ? ' pill-warn' : ''}`}>{STATE[c.state]}</span> : null}
      </div>
      <p className="comment-body">{c.body ?? <i className="muted">No text</i>}</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {sent ? <p className="muted" role="status">Reply sent — listeners see it with the Host mark.</p> : null}
      {live ? (
        <div className="comment-actions">
          <button type="button" className="linkish" onClick={() => setReplying((r) => !r)} aria-expanded={replying}>Reply</button>
          {c.state === 'visible'
            ? <button type="button" className="linkish" onClick={() => setConfirm('hide')}>Hide</button>
            : <button type="button" className="linkish" onClick={() => setConfirm('unhide')}>Un-hide</button>}
          {c.author && !c.byTeam && !muted ? <button type="button" className="linkish" onClick={() => setMuting(true)}>Mute {c.author.displayName}</button> : null}
          {muted ? <span className="muted" role="status">Muted on your show</span> : null}
        </div>
      ) : null}
      {replying ? (
        <form className="reply-box" onSubmit={(e) => {
          e.preventDefault();
          void act(() => api(`/v1/studio/shows/${show.key}/comments/${c.id}/reply`, { method: 'POST', body: { body: text } }), () => { setText(''); setReplying(false); setSent(true); onChanged(); });
        }}>
          <label className="sr-only" htmlFor={`r-${c.id}`}>Your reply</label>
          <textarea id={`r-${c.id}`} maxLength={2000} required value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply as the host" />
          <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
        </form>
      ) : null}
      {muting && c.author ? (
        <MuteDialog show={show} id={c.author.id} name={c.author.displayName} busy={busy} setBusy={setBusy}
          onDone={() => { setMuting(false); setMuted(true); }} onError={setError} onCancel={() => setMuting(false)} />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm === 'hide' ? 'Hide this comment?' : 'Show this comment again?'}
          body={confirm === 'hide'
            ? 'Listeners will no longer see it. Its author still sees it, marked "Hidden by the host". You can undo this.'
            : 'Listeners will see it again, where it was.'}
          confirm={confirm === 'hide' ? 'Hide' : 'Un-hide'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { void act(() => api(`/v1/studio/shows/${show.key}/comments/${c.id}/${confirm}`, { method: 'POST' }), () => { setConfirm(null); onChanged(); }); }}
        />
      ) : null}
    </article>
  );
}

/** US3 — every comment on the show (FR-014..FR-016). */
export function Comments({ show }: { show: Show }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const eps = useLoad(() => api<EpisodePage>(`/v1/studio/shows/${show.key}/episodes?page=1`), [show.key]);
  return (
    <>
      <PageHead title="Comments" sub="Answer as the host, or hide what does not belong on your show." />
      <div className="toolbar">
        <label className="sr-only" htmlFor="c-q">Search comments</label>
        <input id="c-q" type="search" placeholder="Search comments" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="c-ep">Episode</label>
        <select id="c-ep" className="select" value={episodeId} onChange={(e) => setEpisodeId(e.target.value)}>
          <option value="">All episodes</option>
          {eps.state === 'ready' ? eps.data.items.map((e) => <option key={e.id} value={e.id}>{e.title}</option>) : null}
        </select>
      </div>
      <section className="card"><CommentList show={show} q={query} {...(episodeId ? { episodeId } : {})} /></section>
    </>
  );
}
