// Page listing all comments on a show, with reply, hide, pin, like, report and mute; comment settings and Pending.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { REPORT_NOTE_MAX, type ReportReason } from '@socialmorning/social-core';
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
  /** M19 US12: pinned to the top of its episode's comments in the app (top-level only). */
  pinned?: boolean; voice?: { url: string; ms: number };
  /** M22 US10: pinned to the bottom — last under every sort in the app (top-level only). */
  pinnedBottom?: boolean;
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
  /** M24 US14: the list does not say whether you liked it, so this starts off and follows your clicks. */
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState<number | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState<string | null>(null);
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
        {c.pinned ? <span className="pill pill-warn">Pinned</span> : null}
        {c.pinnedBottom ? <span className="pill pill-warn">Pinned to bottom</span> : null}
        {STATE[c.state] ? <span className={`pill${c.state === 'host_hidden' ? ' pill-warn' : ''}`}>{STATE[c.state]}</span> : null}
      </div>
      <p className="comment-body">{c.body ?? (c.voice ? null : <i className="muted">No text</i>)}</p>
      {c.voice ? <audio controls preload="none" src={c.voice.url} aria-label={`Voice comment, ${mmss(c.voice.ms)}`} /> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {sent ? <p className="muted" role="status">Reply sent — listeners see it with the Host mark.</p> : null}
      {live ? (
        <div className="comment-actions">
          <button type="button" className="linkish" onClick={() => setReplying((r) => !r)} aria-expanded={replying}>Reply</button>
          {c.state === 'visible'
            ? <button type="button" className="linkish" onClick={() => setConfirm('hide')}>Hide</button>
            : <button type="button" className="linkish" onClick={() => setConfirm('unhide')}>Un-hide</button>}
          {c.parentId === null && c.state === 'visible' && c.author ? (
            <button type="button" className="linkish" disabled={busy}
              onClick={() => { void act(() => api(`/v1/studio/shows/${show.key}/comments/${c.id}/${c.pinned ? 'unpin' : 'pin'}`, { method: 'POST' }), onChanged); }}>
              {c.pinned ? 'Unpin' : 'Pin'}
            </button>
          ) : null}
          {c.parentId === null && c.state === 'visible' && c.author ? (
            <button type="button" className="linkish" disabled={busy}
              onClick={() => { void act(() => api(`/v1/studio/shows/${show.key}/comments/${c.id}/pin-bottom`, { method: c.pinnedBottom ? 'DELETE' : 'POST' }), onChanged); }}>
              {c.pinnedBottom ? 'Unpin from bottom' : 'Pin to bottom'}
            </button>
          ) : null}
          {c.author && !c.byTeam && c.state === 'visible' ? (
            <button type="button" className="linkish" disabled={busy} aria-pressed={liked}
              onClick={() => { void act(async () => { const r = await api<{ likeCount: number; likedByMe: boolean }>(`/v1/studio/shows/${show.key}/comments/${c.id}/like`, { method: liked ? 'DELETE' : 'PUT' }); setLiked(r.likedByMe); setLikeCount(r.likeCount); }); }}>
              {liked ? 'Liked' : 'Like'}{likeCount !== null ? <span className="num"> · {likeCount}</span> : null}
            </button>
          ) : null}
          {c.author && !c.byTeam && !reported ? <button type="button" className="linkish" onClick={() => setReporting(true)}>Report</button> : null}
          {reported ? <span className="muted" role="status">{reported}</span> : null}
          {c.author && !c.byTeam && !muted ? <button type="button" className="linkish" onClick={() => setMuting(true)}>Mute {c.author.displayName}</button> : null}
          {muted ? <span className="muted" role="status">Muted on your show</span> : null}
        </div>
      ) : null}
      {reporting ? (
        <ReportDialog show={show} commentId={c.id} onCancel={() => setReporting(false)}
          onDone={(duplicate) => { setReporting(false); setReported(duplicate ? 'You already reported this.' : 'Reported. Our moderators will look at it.'); }} />
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

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' }, { value: 'harassment', label: 'Harassment' }, { value: 'hate', label: 'Hate' },
  { value: 'sexual', label: 'Sexual content' }, { value: 'violence', label: 'Violence' }, { value: 'illegal', label: 'Something illegal' },
  { value: 'other', label: 'Something else' },
];

/** M24 US14: report a listener's comment to SocialMorning's moderators — the same report the app sends. */
function ReportDialog({ show, commentId, onCancel, onDone }: { show: Show; commentId: string; onCancel: () => void; onDone: (duplicate: boolean) => void }) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string; duplicate: boolean }>(`/v1/studio/shows/${show.key}/comments/${commentId}/report`, { method: 'POST', body: { reason, ...(note.trim() ? { note: note.trim() } : {}) } });
      onDone(r.duplicate);
    } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  return (
    <ConfirmDialog title="Report this comment?" body="SocialMorning's moderators look at it. The author is not told who reported it."
      confirm="Report" busy={busy} onCancel={onCancel} onConfirm={() => { void send(); }}>
      <div className="field">
        <label htmlFor={`rp-r-${commentId}`}>Reason</label>
        <select id={`rp-r-${commentId}`} className="select" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
          {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`rp-n-${commentId}`}>Note (optional)</label>
        <textarea id={`rp-n-${commentId}`} className="textarea" rows={3} maxLength={REPORT_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        <span className="muted num" style={{ fontSize: 13, textAlign: 'right' }}>{note.length} / {REPORT_NOTE_MAX}</span>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </ConfirmDialog>
  );
}

export type CommentMode = 'open' | 'closed' | 'review';
export type CommentPolicy = { show: CommentMode; episodes: { episodeId: string; mode: CommentMode }[] };
export const MODES: { value: CommentMode; label: string; hint: string }[] = [
  { value: 'open', label: 'Open', hint: 'Comments appear at once.' },
  { value: 'closed', label: 'Closed', hint: 'Nobody can comment. Comments already there stay.' },
  { value: 'review', label: 'Review first', hint: 'New comments wait under Pending until you approve them.' },
];

/** M24 US8: who may comment on the whole show. Saved at once, like the tips switch. */
function CommentSettings({ show }: { show: Show }) {
  const p = useLoad(() => api<CommentPolicy>(`/v1/studio/shows/${show.key}/comment-policy`), [show.key]);
  const [mode, setMode] = useState<CommentMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (p.state === 'ready') setMode(p.data.show); }, [p.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (next: CommentMode) => {
    const before = mode;
    setBusy(true); setMsg(null); setMode(next);
    try {
      const r = await api<CommentPolicy>(`/v1/studio/shows/${show.key}/comment-policy`, { method: 'PUT', body: { mode: next } });
      setMode(r.show);
      setMsg({ ok: true, text: `Saved: comments are ${MODES.find((m) => m.value === r.show)?.label.toLowerCase() ?? r.show}.` });
    } catch (e) { setMode(before); setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'That did not save.' }); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="cs-h" style={{ marginBottom: 16 }}>
      <h2 id="cs-h">Comment settings</h2>
      {p.state === 'error' ? <Failed message={p.message} retry={p.retry} /> : null}
      {p.state === 'loading' || (p.state === 'ready' && mode === null) ? <Loading lines={1} label="Comment settings" /> : null}
      {mode !== null ? (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Who may comment on your show</legend>
          {MODES.map((m) => (
            <label key={m.value} className="radio">
              <input type="radio" name="c-mode" value={m.value} checked={mode === m.value} disabled={busy} onChange={() => { void save(m.value); }} />
              <span><b>{m.label}</b> <span className="muted">— {m.hint}</span></span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {msg ? <p className={msg.ok ? 'muted' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      {p.state === 'ready' && p.data.episodes.length > 0
        ? <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>{p.data.episodes.length} {p.data.episodes.length === 1 ? 'episode has its own setting' : 'episodes have their own setting'}, on the episode's page.</p>
        : null}
    </section>
  );
}

export type PendingComment = {
  id: string; episodeId: string; episodeTitle: string; author: { id: string; displayName: string } | null;
  body: string | null; offsetMs: number | null; parentId: string | null; createdAt: string;
};

/** M24 US8: comments held for review, oldest first. Approve publishes one; Reject deletes it after a confirm. */
export function PendingList({ show, episodeId }: { show: Show; episodeId?: string }) {
  const list = useLoad(() => api<{ items: PendingComment[] }>(`/v1/studio/shows/${show.key}/comments/pending${episodeId ? `?episodeId=${encodeURIComponent(episodeId)}` : ''}`), [show.key, episodeId]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingComment | null>(null);
  const run = async (id: string, verb: 'approve' | 'reject') => {
    setBusy(true); setError(null);
    try {
      await api(`/v1/studio/shows/${show.key}/comments/pending/${id}/${verb}`, { method: 'POST' });
      setGone((g) => new Set(g).add(id));
    } catch (e) { setError(e instanceof HttpError ? e.message : 'That did not work.'); } finally { setBusy(false); }
  };
  if (list.state === 'loading') return <Loading lines={4} label="Pending comments" />;
  if (list.state === 'error') return <Failed message={list.message} retry={list.retry} />;
  const items = list.data.items.filter((c) => !gone.has(c.id));
  return (
    <div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {items.length === 0 ? <Empty title="Nothing waiting">When comments are set to Review first, new ones wait here until you approve them.</Empty> : null}
      {items.map((c) => (
        <article key={c.id} className="comment" aria-label={`Pending comment by ${c.author?.displayName ?? 'unknown'}`}>
          <div className="comment-meta">
            <strong style={{ color: 'var(--text)' }}>{c.author?.displayName ?? '—'}</strong>
            {!episodeId ? <Link to={`/s/${show.key}/episodes/${c.episodeId}`}>{c.episodeTitle}</Link> : null}
            {c.offsetMs !== null ? <span className="num">at {mmss(c.offsetMs)}</span> : null}
            <span>{shortDate(c.createdAt)}</span>
            {c.parentId ? <span className="pill">Reply</span> : null}
          </div>
          <p className="comment-body">{c.body ?? <i className="muted">No text</i>}</p>
          <div className="comment-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => { void run(c.id, 'approve'); }}>Approve<span className="sr-only"> the comment by {c.author?.displayName ?? 'unknown'}</span></button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setRejecting(c)}>Reject<span className="sr-only"> the comment by {c.author?.displayName ?? 'unknown'}</span></button>
          </div>
        </article>
      ))}
      {rejecting ? (
        <ConfirmDialog title="Reject this comment?" body="It is deleted and never shown to listeners. This cannot be undone." confirm="Reject" busy={busy}
          onCancel={() => setRejecting(null)} onConfirm={() => { const c = rejecting; setRejecting(null); void run(c.id, 'reject'); }} />
      ) : null}
    </div>
  );
}

/** US3 — every comment on the show (FR-014..FR-016). M24 US8: comment settings and the Pending tab. */
export function Comments({ show }: { show: Show }) {
  const tab = useLocation().pathname.split('/').at(-1);
  const base = `/s/${show.key}/comments`;
  return (
    <>
      <PageHead title="Comments" sub="Answer as the host, or hide what does not belong on your show."
        action={<Link className="btn btn-quiet" to={`/s/${show.key}/bans`}>Banned listeners</Link>}
        tabs={[{ to: base, label: 'All comments' }, { to: `${base}/pending`, label: 'Pending' }]} />
      {tab === 'pending' ? <section className="card"><PendingList show={show} /></section> : <AllComments show={show} />}
    </>
  );
}

function AllComments({ show }: { show: Show }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [episodeId, setEpisodeId] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const eps = useLoad(() => api<EpisodePage>(`/v1/studio/shows/${show.key}/episodes?page=1`), [show.key]);
  return (
    <>
      <CommentSettings show={show} />
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
